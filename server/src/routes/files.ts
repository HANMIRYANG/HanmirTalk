import { Router, type NextFunction, type Request, type Response } from "express";
import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import multer from "multer";
import type { CreateFileInput, FileFolder, ListFilesFilter } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { requireAuth, requireRole } from "../auth/middleware";
import { hashPassword, verifyPassword } from "../auth/password";
import { auditLog } from "../audit";
import { config } from "../config";
import { normalizeUploadOriginalName } from "../files/filename";

// Phase 1 D-6 — file upload security (docs/12).
// Allowed extensions per docs/12 (이미지 / 문서 / 스프레드시트 / 발표 / 압축).
const ALLOWED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "webp", "gif",
  "pdf",
  "doc", "docx", "hwp", "hwpx",
  "xls", "xlsx", "csv",
  "ppt", "pptx",
  "zip"
]);

// Executable / script files we always refuse, even if a future admin
// loosens ALLOWED_EXTENSIONS. Keep this list aggressive.
const BLOCKED_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "com", "scr", "msi", "ps1", "vbs", "vbe",
  "js", "jse", "wsf", "wsh", "jar", "sh", "bash", "zsh",
  "app", "command", "deb", "rpm", "dmg",
  "html", "htm", "svg" // potential script vectors
]);

// MIME prefixes we accept. Acts as a sanity check on top of extension.
const ALLOWED_MIME_PREFIXES = [
  "image/",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-hwp",
  "application/haansofthwp",
  "text/csv",
  "text/plain" // common for .csv detected as text/plain
];

function classifyExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// Generate a safe disk filename: <yyyy>/<mm>/<random>-<sanitized-original>
function safeFilename(original: string): { rel: string; absDir: string; abs: string } {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const subdir = path.join(yyyy, mm);
  // Strip path separators and **all** control chars (C0 U+0000-U+001F / DEL
  // U+007F / C1 U+0080-U+009F). C1 is mainly seen when the latin1 mojibake
  // is *not* recoverable upstream — we still don't want those bytes on disk.
  // Unicode (한글/한자/일문 등) 는 그대로 유지. 명시적 unicode escape 만
  // 사용해 소스 파일 자체에 제어 바이트를 박지 않는다.
  const CONTROL_CHARS = new RegExp(
    "[\\u0000-\\u001F\\u007F-\\u009F]",
    "g"
  );
  const cleaned = original
    .replace(/[\\/]/g, "_")
    .replace(CONTROL_CHARS, "")
    .slice(0, 120) || "upload";
  const token = randomBytes(8).toString("hex");
  const filename = `${token}-${cleaned}`;
  const absDir = path.join(config.uploadDir, subdir);
  const abs = path.join(absDir, filename);
  const rel = path.join(subdir, filename).replace(/\\/g, "/");
  return { rel, absDir, abs };
}

function resolveStoragePath(fileUrl: string): string | undefined {
  const uploadRoot = path.resolve(config.uploadDir);
  const targetPath = path.resolve(uploadRoot, fileUrl);
  const relative = path.relative(uploadRoot, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative) || relative === "") {
    return undefined;
  }
  return targetPath;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploadMaxBytes },
  fileFilter: (_req, file, cb) => {
    // 확장자 검사도 mojibake 복원된 이름 기준 — "테스트.pdf" 가 깨진
    // 상태에선 마지막 토큰이 ".pdf" 로 살아남지만, 정책상 한 곳에서 한
    // 가지 normalized name 만 쓰는 게 일관성 측면에서 옳다.
    const normalized = normalizeUploadOriginalName(file.originalname);
    const ext = classifyExtension(normalized);
    if (BLOCKED_EXTENSIONS.has(ext)) {
      cb(new Error("blocked_extension"));
      return;
    }
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(new Error("unsupported_extension"));
      return;
    }
    const mime = (file.mimetype ?? "").toLowerCase();
    const mimeOk =
      ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p)) || mime === "";
    if (!mimeOk) {
      cb(new Error("unsupported_mime"));
      return;
    }
    cb(null, true);
  }
});

// Translate multer fileFilter errors + size-limit errors into clean 4xx
// responses instead of falling through to the 500 handler.
function uploadErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  if (!err) return next();
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "blocked_extension") {
    res.status(415).json({ error: "blocked_extension" });
    return;
  }
  if (msg === "unsupported_extension") {
    res.status(415).json({ error: "unsupported_extension" });
    return;
  }
  if (msg === "unsupported_mime") {
    res.status(415).json({ error: "unsupported_mime" });
    return;
  }
  if (msg.toLowerCase().includes("file too large")) {
    res.status(413).json({ error: "file_too_large" });
    return;
  }
  next(err);
}

// 폴더 트리 헬퍼 — 폴더 수가 적으므로(부서 단위) 전체를 로드해 앱단에서
// 조상 체인을 계산한다.
type FolderMap = Map<string, FileFolder>;

function rootOf(map: FolderMap, folder: FileFolder): FileFolder {
  let cur = folder;
  const seen = new Set<string>();
  while (cur.parentId && !seen.has(cur.id)) {
    seen.add(cur.id);
    const parent = map.get(cur.parentId);
    if (!parent) break;
    cur = parent;
  }
  return cur;
}

// 자기 자신 또는 조상 중 비밀번호가 걸린 가장 가까운 폴더.
function nearestProtected(map: FolderMap, folder: FileFolder): FileFolder | undefined {
  let cur: FileFolder | undefined = folder;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    if (cur.hasPassword) return cur;
    seen.add(cur.id);
    cur = cur.parentId ? map.get(cur.parentId) : undefined;
  }
  return undefined;
}

// 비밀번호 보호 체인 안에 있는 폴더 id 전체 (전체 파일 목록에서 제외용).
function protectedFolderIds(map: FolderMap): Set<string> {
  const out = new Set<string>();
  for (const folder of map.values()) {
    if (nearestProtected(map, folder)) out.add(folder.id);
  }
  return out;
}

function isAdminRole(role: string): boolean {
  return role === "admin" || role === "super_admin";
}

// 하위 폴더 생성/폴더 업로드 권한: admin·super_admin 또는 루트(부서)
// 폴더의 참여자.
function canWriteIn(
  map: FolderMap,
  user: { id: string; role: string },
  folder: FileFolder
): boolean {
  if (isAdminRole(user.role)) return true;
  return rootOf(map, folder).memberIds.includes(user.id);
}

export function createFilesRouter(repos: Repositories): Router {
  const router = Router();
  const adminOnly = requireRole("admin", "super_admin");

  const loadFolderMap = async (): Promise<FolderMap> => {
    const folders = await repos.files.listFolders();
    return new Map(folders.map((f) => [f.id, f]));
  };

  router.get("/", async (req, res) => {
    const filter: ListFilesFilter = {};
    if (isString(req.query.projectId)) filter.projectId = req.query.projectId;
    if (isString(req.query.productId)) filter.productId = req.query.productId;
    if (isString(req.query.taskId)) filter.taskId = req.query.taskId;
    if (isString(req.query.messageId)) filter.messageId = req.query.messageId;
    if (isString(req.query.uploaderId)) filter.uploaderId = req.query.uploaderId;
    let files = await repos.files.listFiles(filter);
    // 비밀번호 보호 폴더 안의 파일은 전체 목록에서 숨긴다 (폴더 contents
    // 엔드포인트로만 접근 — 그쪽에서 비밀번호를 검증한다). super_admin 예외.
    if (req.currentUser?.role !== "super_admin") {
      const map = await loadFolderMap();
      const hidden = protectedFolderIds(map);
      if (hidden.size > 0) {
        files = files.filter((f) => !f.folderId || !hidden.has(f.folderId));
      }
    }
    res.json(files);
  });

  router.get("/folders", async (_req, res) => {
    const folders = await repos.files.listFolders();
    res.json(folders);
  });

  // 폴더 생성.
  //   - 최상위(부서) 폴더: admin/super_admin 전용, 비밀번호 불가, 참여자 지정 가능
  //   - 하위 폴더: 루트 참여자 또는 admin/super_admin, 비밀번호 선택 가능
  router.post("/folders", async (req, res) => {
    const me = req.currentUser!;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      res.status(400).json({ error: "name_required" });
      return;
    }
    if (name.length > 100) {
      res.status(400).json({ error: "name_too_long" });
      return;
    }
    const parentId = isString(body.parentId) ? body.parentId : undefined;
    const password =
      typeof body.password === "string" && body.password.length > 0
        ? body.password
        : undefined;

    if (!parentId) {
      if (!isAdminRole(me.role)) {
        res.status(403).json({ error: "admin_only" });
        return;
      }
      if (password) {
        res.status(400).json({ error: "password_not_allowed_on_root" });
        return;
      }
      const memberIds = Array.isArray(body.memberIds)
        ? body.memberIds.filter((x): x is string => typeof x === "string")
        : [];
      const created = await repos.files.createFolder({ name, memberIds }, me.id);
      await auditLog(repos, req, {
        action: "folder.create",
        targetType: "folder",
        targetId: created.id,
        targetLabel: created.name,
        meta: { root: true, memberCount: memberIds.length }
      });
      res.status(201).json(created);
      return;
    }

    const map = await loadFolderMap();
    const parent = map.get(parentId);
    if (!parent) {
      res.status(404).json({ error: "parent_not_found" });
      return;
    }
    if (!canWriteIn(map, me, parent)) {
      res.status(403).json({ error: "not_folder_member" });
      return;
    }
    if (password && password.length < 4) {
      res.status(400).json({ error: "password_too_short" });
      return;
    }
    const created = await repos.files.createFolder(
      {
        name,
        parentId,
        passwordHash: password ? hashPassword(password) : undefined
      },
      me.id
    );
    await auditLog(repos, req, {
      action: "folder.create",
      targetType: "folder",
      targetId: created.id,
      targetLabel: created.name,
      meta: { parentId, protected: Boolean(password) }
    });
    res.status(201).json(created);
  });

  // 폴더 내용 조회 — 비밀번호 게이트. 보호 체인(자신 또는 조상)에 비밀번호
  // 폴더가 있으면 x-folder-password 헤더(encodeURIComponent 인코딩)를
  // 검증한다. super_admin 은 비밀번호 없이 통과.
  router.get("/folders/:id/contents", async (req, res) => {
    const me = req.currentUser!;
    const map = await loadFolderMap();
    const folder = map.get(req.params.id);
    if (!folder) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const guard = nearestProtected(map, folder);
    if (guard && me.role !== "super_admin") {
      const rawHeader = req.header("x-folder-password") ?? "";
      let supplied = "";
      try {
        supplied = decodeURIComponent(rawHeader);
      } catch {
        supplied = rawHeader;
      }
      const hash = await repos.files.folderPasswordHash(guard.id);
      if (!hash || !supplied || !verifyPassword(supplied, hash)) {
        res.status(403).json({
          error: "password_required",
          folderId: guard.id,
          folderName: guard.name
        });
        return;
      }
    }
    const subfolders = [...map.values()].filter((f) => f.parentId === folder.id);
    const files = await repos.files.listFiles({ folderId: folder.id });
    res.json({ folder, subfolders, files });
  });

  // 폴더 이름/참여자 수정 — admin 전용.
  router.patch("/folders/:id", adminOnly, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const input: { name?: string; memberIds?: string[] } = {};
    if (typeof body.name === "string" && body.name.trim()) {
      input.name = body.name.trim().slice(0, 100);
    }
    if (Array.isArray(body.memberIds)) {
      input.memberIds = body.memberIds.filter(
        (x): x is string => typeof x === "string"
      );
    }
    const updated = await repos.files.updateFolder(req.params.id, input);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "folder.update",
      targetType: "folder",
      targetId: updated.id,
      targetLabel: updated.name
    });
    res.json(updated);
  });

  // 폴더 삭제 — admin 전용, 빈 폴더만 (하위 폴더·파일이 없을 때).
  router.delete("/folders/:id", adminOnly, async (req, res) => {
    const folder = await repos.files.findFolderById(req.params.id);
    if (!folder) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (folder.fileCount > 0 || folder.childCount > 0) {
      res.status(409).json({ error: "folder_not_empty" });
      return;
    }
    await repos.files.deleteFolder(folder.id);
    await auditLog(repos, req, {
      action: "folder.delete",
      targetType: "folder",
      targetId: folder.id,
      targetLabel: folder.name,
      level: "warn"
    });
    res.json({ ok: true });
  });

  router.post(
    "/upload",
    requireAuth,
    upload.single("file"),
    uploadErrorHandler,
    async (req: Request, res: Response) => {
      const file = req.file;
      if (!file) {
      res.status(400).json({ error: "file_required" });
      return;
    }
    // 폴더 업로드 권한 — 디스크에 쓰기 전에 검증해 고아 파일을 막는다.
    const folderId = isString(req.body?.folderId) ? req.body.folderId : undefined;
    if (folderId) {
      const map = await loadFolderMap();
      const folder = map.get(folderId);
      if (!folder) {
        res.status(404).json({ error: "folder_not_found" });
        return;
      }
      if (!canWriteIn(map, req.currentUser!, folder)) {
        res.status(403).json({ error: "not_folder_member" });
        return;
      }
    }
    // Phase 10 follow-up — multer 가 multipart filename 을 latin1 로
    // 디코딩해서 한글 파일명이 mojibake 로 들어오는 케이스 복원. 이
    // 시점에 한 번만 정규화하고, 이후 disk filename / DB / 응답에 모두
    // 같은 normalized 값을 사용한다. ASCII 파일명은 그대로 통과 (idempotent).
    const originalName = normalizeUploadOriginalName(file.originalname);
    const { rel, absDir, abs } = safeFilename(originalName);
    try {
      await fs.mkdir(absDir, { recursive: true });
      await fs.writeFile(abs, file.buffer);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[hanmir-server] upload write failed:", err);
      res.status(500).json({ error: "upload_failed" });
      return;
    }
    const input: CreateFileInput = {
      fileName: originalName,
      fileSize: file.size,
      fileType: file.mimetype || undefined,
      fileUrl: rel,
      projectId: isString(req.body?.projectId) ? req.body.projectId : undefined,
      productId: isString(req.body?.productId) ? req.body.productId : undefined,
      taskId: isString(req.body?.taskId) ? req.body.taskId : undefined,
      messageId: isString(req.body?.messageId) ? req.body.messageId : undefined,
      folderId
    };
    try {
      const created = await repos.files.create(input, req.currentUser!.id);
      res.status(201).json(created);
    } catch (err) {
      // Roll back the on-disk file when the DB insert fails so we don't leak
      // orphaned bytes.
      await fs.unlink(abs).catch(() => undefined);
      throw err;
    }
  });

  router.get("/:id/download", requireAuth, async (req, res) => {
    const storage = await repos.files.findStorage(req.params.id);
    if (!storage) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const abs = resolveStoragePath(storage.fileUrl);
    // Defense in depth: refuse paths that escaped the upload root.
    if (!abs) {
      res.status(400).json({ error: "invalid_path" });
      return;
    }
    try {
      await fs.access(abs);
    } catch {
      res.status(410).json({ error: "file_missing" });
      return;
    }
    res.download(abs, storage.fileName);
  });

  router.delete("/:id", requireAuth, async (req, res) => {
    const me = req.currentUser!;
    const file = await repos.files.findById(req.params.id);
    if (!file) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    // 업로더 본인 또는 admin만 삭제 가능 (메시지 삭제와 동일한 정책).
    const isAdmin = me.role === "admin" || me.role === "super_admin";
    if (!isAdmin && file.uploaderId !== me.id) {
      res.status(403).json({ error: "not_uploader_or_admin" });
      return;
    }
    const storage = await repos.files.findStorage(req.params.id);
    const ok = await repos.files.delete(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (storage) {
      const abs = resolveStoragePath(storage.fileUrl);
      if (abs) {
        await fs.unlink(abs).catch(() => undefined);
      }
    }
    await auditLog(repos, req, {
      action: "file.delete",
      targetType: "file",
      targetId: req.params.id,
      targetLabel: storage?.fileName,
      level: "warn"
    });
    res.json({ ok: true });
  });

  router.get("/:id", async (req, res) => {
    const file = await repos.files.findById(req.params.id);
    if (!file) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(file);
  });

  return router;
}
