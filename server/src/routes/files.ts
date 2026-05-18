import { Router, type NextFunction, type Request, type Response } from "express";
import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import multer from "multer";
import type { CreateFileInput, ListFilesFilter } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { requireAuth } from "../auth/middleware";
import { config } from "../config";

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
  // Strip path separators and control chars; keep unicode (Korean) intact.
  const cleaned = original
    .replace(/[\\/]/g, "_")
    .replace(/[\x00-\x1f]/g, "")
    .slice(0, 120) || "upload";
  const token = randomBytes(8).toString("hex");
  const filename = `${token}-${cleaned}`;
  const absDir = path.join(config.uploadDir, subdir);
  const abs = path.join(absDir, filename);
  const rel = path.join(subdir, filename).replace(/\\/g, "/");
  return { rel, absDir, abs };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploadMaxBytes },
  fileFilter: (_req, file, cb) => {
    const ext = classifyExtension(file.originalname);
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

export function createFilesRouter(repos: Repositories): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const filter: ListFilesFilter = {};
    if (isString(req.query.projectId)) filter.projectId = req.query.projectId;
    if (isString(req.query.productId)) filter.productId = req.query.productId;
    if (isString(req.query.taskId)) filter.taskId = req.query.taskId;
    if (isString(req.query.messageId)) filter.messageId = req.query.messageId;
    if (isString(req.query.uploaderId)) filter.uploaderId = req.query.uploaderId;
    const files = await repos.files.listFiles(filter);
    res.json(files);
  });

  router.get("/folders", async (_req, res) => {
    const folders = await repos.files.listFolders();
    res.json(folders);
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
    const { rel, absDir, abs } = safeFilename(file.originalname);
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
      fileName: file.originalname,
      fileSize: file.size,
      fileType: file.mimetype || undefined,
      fileUrl: rel,
      projectId: isString(req.body?.projectId) ? req.body.projectId : undefined,
      productId: isString(req.body?.productId) ? req.body.productId : undefined,
      taskId: isString(req.body?.taskId) ? req.body.taskId : undefined,
      messageId: isString(req.body?.messageId) ? req.body.messageId : undefined
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
    const abs = path.resolve(config.uploadDir, storage.fileUrl);
    // Defense in depth: refuse paths that escaped the upload root.
    if (!abs.startsWith(config.uploadDir)) {
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
    const storage = await repos.files.findStorage(req.params.id);
    const ok = await repos.files.delete(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (storage) {
      const abs = path.resolve(config.uploadDir, storage.fileUrl);
      if (abs.startsWith(config.uploadDir)) {
        await fs.unlink(abs).catch(() => undefined);
      }
    }
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
