// 회의 오디오 파일 IO. 오디오는 attachments 가 아니라 서버 내부 파일 —
// <uploadDir>/meetings/<meetingId>/seg-NNN.webm. 다운로드 API 는 노출하지
// 않고(방 멤버라도 원본 오디오 직접 접근 불가), 파이프라인과 보존기한
// 정리 잡만 이 모듈을 통해 접근한다.
import fs from "fs/promises";
import path from "path";
import { config } from "../config";

export function meetingDirRel(meetingId: string): string {
  return path.posix.join("meetings", meetingId);
}

// createSegment(repo) 가 DB 에 기록하는 file_path 와 동일 규약. 둘 중
// 하나를 바꾸면 반드시 같이 바꿀 것.
export function segmentRelPath(meetingId: string, segIndex: number): string {
  return path.posix.join(
    meetingDirRel(meetingId),
    `seg-${String(segIndex).padStart(3, "0")}.webm`
  );
}

// routes/files.ts resolveStoragePath 와 동일한 경로 이탈 가드.
export function resolveMeetingPath(rel: string): string | undefined {
  const uploadRoot = path.resolve(config.uploadDir);
  const targetPath = path.resolve(uploadRoot, rel);
  const relative = path.relative(uploadRoot, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative) || relative === "") {
    return undefined;
  }
  return targetPath;
}

// 청크 byte-append. 같은 MediaRecorder 세션의 timeslice 청크는 첫 청크에만
// WebM 컨테이너 헤더가 있어 seq 순 append 로만 유효한 파일이 된다 — 순서
// 보장은 라우트의 last_seq 가드 책임.
export async function appendChunk(rel: string, buf: Buffer): Promise<void> {
  const abs = resolveMeetingPath(rel);
  if (!abs) throw new Error("invalid_meeting_path");
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.appendFile(abs, buf);
}

// append 후 recordChunk 가드가 실패한 극단 레이스에서 디스크를 DB 관점
// 크기로 되돌린다 (클라이언트는 순차 업로드라 정상 흐름에선 도달 불가).
export async function truncateSegment(rel: string, bytes: number): Promise<void> {
  const abs = resolveMeetingPath(rel);
  if (!abs) return;
  await fs.truncate(abs, bytes).catch(() => undefined);
}

export async function segmentAbsPath(rel: string): Promise<string> {
  const abs = resolveMeetingPath(rel);
  if (!abs) throw new Error("invalid_meeting_path");
  await fs.access(abs);
  return abs;
}

// 업로드된 부서별 주간보고 PPT. 오디오와 같은 회의 디렉터리에 있어
// deleteMeetingAudio(보존기한/취소 정리)가 함께 지운다 — 회의록 생성에
// 필요한 추출 텍스트는 meeting_ppt 테이블에 남으므로 파일 삭제와 무관.
export function pptRelPath(meetingId: string): string {
  return path.posix.join(meetingDirRel(meetingId), "ppt.pptx");
}

export async function writePptFile(meetingId: string, buf: Buffer): Promise<string> {
  const rel = pptRelPath(meetingId);
  const abs = resolveMeetingPath(rel);
  if (!abs) throw new Error("invalid_meeting_path");
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf);
  return rel;
}

export async function readPptFile(rel: string): Promise<Buffer> {
  const abs = resolveMeetingPath(rel);
  if (!abs) throw new Error("invalid_meeting_path");
  return fs.readFile(abs);
}

// 보존기한/취소 정리 — 디렉터리째 제거. 이미 없으면 무시(멱등).
export async function deleteMeetingAudio(meetingId: string): Promise<void> {
  const abs = resolveMeetingPath(meetingDirRel(meetingId));
  if (!abs) return;
  await fs.rm(abs, { recursive: true, force: true });
}
