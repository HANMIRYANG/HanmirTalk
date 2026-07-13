// 파일함 일괄 업로드 — React 무의존 순수 모듈.
//
// 서버 API 는 요청당 1파일(upload.single)이므로 클라이언트가 순차 반복
// 호출한다. 폴더 업로드는 relPath 의 디렉터리 트리를 현재 폴더 아래에
// POST /files/folders 로 재현하되, 동명 폴더가 이미 있으면 재사용한다.
import type { FileFolder } from "@hanmir/shared";
import { ApiError } from "@/services/api-client";
import { fileService } from "@/services/file.service";

export interface UploadItem {
  file: File;
  // 대상 폴더 기준 상대 경로 (파일명 포함, "/" 구분). 폴더가 아닌 낱개
  // 파일은 파일명 그대로.
  relPath: string;
}

export const MAX_BATCH_FILES = 200;
export const MAX_BATCH_BYTES = 1024 ** 3; // 1GB
// 서버 UPLOAD_MAX_BYTES 기본값과 동일 — 확정 실패할 요청은 보내지 않는
// 사전 차단용이며, 최종 판정은 서버(413)가 한다.
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export interface UploadFailure {
  name: string;
  reason: string;
}

export interface BatchProgress {
  // 지금 시도 중인 파일의 1-base 순번 (0 = 폴더 준비 단계)
  current: number;
  total: number;
  name: string;
}

export interface BatchResult {
  ok: number;
  failures: UploadFailure[];
  // 중단으로 시도조차 하지 않은 수
  skipped: number;
  foldersCreated: number;
  sessionExpired: boolean;
}

export interface RunBatchParams {
  items: UploadItem[];
  // 대상 폴더. 없으면 폴더 미지정 업로드 (하위 경로가 있는 항목은 호출
  // 전에 차단해야 한다 — 최상위 폴더 생성은 admin 전용).
  baseFolderId?: string;
  // 동명 폴더 재사용 판정용 기존 폴더 전체 목록
  existingFolders: FileFolder[];
  isCancelled: () => boolean;
  onProgress: (p: BatchProgress) => void;
  onFolderCreated?: (folder: FileFolder) => void;
}

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)}GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)}MB`;
  return `${Math.ceil(n / 1024)}KB`;
}

// 숨김 파일(.DS_Store 등)과 숨김 폴더 하위는 조용히 제외한다.
function isHiddenPath(relPath: string): boolean {
  return relPath.split("/").some((seg) => seg.startsWith("."));
}

function dirOf(relPath: string): string {
  const idx = relPath.lastIndexOf("/");
  return idx === -1 ? "" : relPath.slice(0, idx);
}

export function hasDirectories(items: UploadItem[]): boolean {
  return items.some((it) => it.relPath.includes("/"));
}

// input[type=file] 선택 결과 → UploadItem[]. webkitdirectory 입력이면
// webkitRelativePath 가 채워져 있어 그대로 상대 경로가 된다.
export function itemsFromFiles(files: File[]): UploadItem[] {
  const out: UploadItem[] = [];
  for (const file of files) {
    const relPath = file.webkitRelativePath || file.name;
    if (isHiddenPath(relPath)) continue;
    out.push({ file, relPath });
  }
  return out;
}

// 시작 전 상한 검사 — 위반 시 안내 문구, 통과 시 null.
export function limitError(items: UploadItem[]): string | null {
  if (items.length === 0) return "업로드할 파일이 없습니다.";
  if (items.length > MAX_BATCH_FILES) {
    return `한 번에 최대 ${MAX_BATCH_FILES}개까지 업로드할 수 있습니다. (선택: ${items.length}개)`;
  }
  const total = items.reduce((sum, it) => sum + it.file.size, 0);
  if (total > MAX_BATCH_BYTES) {
    return `한 번에 총 1GB까지 업로드할 수 있습니다. (선택: ${formatBytes(total)})`;
  }
  return null;
}

async function readAllEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  // readEntries 는 회당 최대 100개만 돌려주므로 빈 배열이 나올 때까지 반복.
  const reader = dir.createReader();
  const out: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject)
    );
    if (batch.length === 0) return out;
    out.push(...batch);
  }
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

// drop 이벤트의 DataTransfer → 파일/디렉터리 재귀 순회.
// 주의: DataTransferItem 은 핸들러가 반환되면 무효화되므로
// webkitGetAsEntry() 는 첫 await 이전(동기 구간)에 모두 뽑아둔다.
export async function collectDropItems(dt: DataTransfer): Promise<UploadItem[]> {
  const entries: FileSystemEntry[] = [];
  const plainFiles: File[] = [];
  for (const item of Array.from(dt.items)) {
    if (item.kind !== "file") continue;
    const entry =
      typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
    if (entry) {
      entries.push(entry);
    } else {
      const file = item.getAsFile();
      if (file) plainFiles.push(file);
    }
  }

  const out: UploadItem[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.name.startsWith(".")) return;
    if (entry.isFile) {
      const file = await entryFile(entry as FileSystemFileEntry);
      out.push({ file, relPath: prefix + entry.name });
      return;
    }
    if (entry.isDirectory) {
      const children = await readAllEntries(entry as FileSystemDirectoryEntry);
      for (const child of children) {
        await walk(child, `${prefix}${entry.name}/`);
      }
    }
  };
  for (const entry of entries) await walk(entry, "");
  for (const file of plainFiles) {
    if (!file.name.startsWith(".")) out.push({ file, relPath: file.name });
  }
  return out;
}

function describeUploadError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 413) return "용량 초과 (최대 50MB)";
    if (err.status === 415) return "허용되지 않는 형식";
    if (err.status === 403) return "권한 없음";
    if (err.status === 0) return "네트워크 오류";
  }
  return "업로드 실패";
}

// relPath 목록에서 필요한 디렉터리 경로를 얕은 것부터 뽑는다.
function collectDirPaths(items: UploadItem[]): string[] {
  const dirs = new Set<string>();
  for (const it of items) {
    const parts = it.relPath.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  }
  return [...dirs].sort(
    (a, b) => a.split("/").length - b.split("/").length
  );
}

export async function runUploadBatch(params: RunBatchParams): Promise<BatchResult> {
  const { items, baseFolderId, existingFolders, isCancelled, onProgress, onFolderCreated } =
    params;
  const failures: UploadFailure[] = [];
  let ok = 0;
  let foldersCreated = 0;
  let sessionExpired = false;

  // 1) 경로 → 폴더 id 매핑. 부모별 (이름 → id) 색인으로 동명 폴더 재사용.
  const childByParent = new Map<string, Map<string, string>>();
  for (const f of existingFolders) {
    if (!f.parentId) continue;
    let names = childByParent.get(f.parentId);
    if (!names) {
      names = new Map();
      childByParent.set(f.parentId, names);
    }
    if (!names.has(f.name)) names.set(f.name, f.id);
  }
  const dirIdByPath = new Map<string, string>();
  const failedDirs = new Set<string>();

  const dirPaths = collectDirPaths(items);
  if (dirPaths.length > 0) {
    onProgress({ current: 0, total: items.length, name: "" });
  }
  for (const dirPath of dirPaths) {
    if (isCancelled() || sessionExpired) break;
    const parentPath = dirOf(dirPath);
    const name = parentPath ? dirPath.slice(parentPath.length + 1) : dirPath;
    const parentId = parentPath ? dirIdByPath.get(parentPath) : baseFolderId;
    if (!parentId || failedDirs.has(parentPath)) {
      failedDirs.add(dirPath);
      continue;
    }
    const existingId = childByParent.get(parentId)?.get(name);
    if (existingId) {
      dirIdByPath.set(dirPath, existingId);
      continue;
    }
    try {
      const created = await fileService.createFolder({ name, parentId });
      dirIdByPath.set(dirPath, created.id);
      let names = childByParent.get(parentId);
      if (!names) {
        names = new Map();
        childByParent.set(parentId, names);
      }
      names.set(name, created.id);
      foldersCreated++;
      onFolderCreated?.(created);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        sessionExpired = true;
        break;
      }
      failedDirs.add(dirPath);
    }
  }

  // 2) 파일 순차 업로드 — 실패해도 다음 파일을 계속 진행한다.
  if (!sessionExpired) {
    for (let i = 0; i < items.length; i++) {
      if (isCancelled()) break;
      const { file, relPath } = items[i];
      onProgress({ current: i + 1, total: items.length, name: file.name });
      const dirPath = dirOf(relPath);
      if (dirPath && (failedDirs.has(dirPath) || !dirIdByPath.has(dirPath))) {
        failures.push({ name: relPath, reason: "폴더 생성 실패" });
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        failures.push({ name: relPath, reason: "용량 초과 (최대 50MB)" });
        continue;
      }
      const folderId = dirPath ? dirIdByPath.get(dirPath) : baseFolderId;
      try {
        await fileService.uploadFile(file, folderId ? { folderId } : {});
        ok++;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          sessionExpired = true;
          break;
        }
        failures.push({ name: relPath, reason: describeUploadError(err) });
      }
    }
  }

  return {
    ok,
    failures,
    skipped: items.length - ok - failures.length,
    foldersCreated,
    sessionExpired
  };
}
