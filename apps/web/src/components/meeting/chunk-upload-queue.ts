// 녹음 청크 업로드 큐 — React 무의존 순수 모듈.
//
// 엄격한 순차(FIFO) 단일 펌프: head 청크가 성공(또는 멱등 duplicate)으로
// 처리되기 전에는 다음 청크를 보내지 않는다 — 서버의 last_seq 가드와
// 정합을 맞추기 위한 설계. 재시도는 1→2→4→8→16초 백오프 5회, 소진 후엔
// 청크를 버리지 않고 30초 간격 + window "online" 이벤트로 계속 재시도한다
// (head 유지 — 세그먼트 중간 청크 유실은 WebM 을 못 쓰게 만들므로).
import { ApiError } from "@/services/api-client";
import { meetingService } from "@/services/meeting.service";

export type UploadHealth = "idle" | "uploading" | "retrying" | "failed";

interface QueuedChunk {
  blob: Blob;
  segIndex: number;
  seq: number;
  durationMs: number;
}

export interface ChunkQueueCallbacks {
  onHealthChange(health: UploadHealth): void;
  onPendingChange(pending: number): void;
  // 서버가 최대 녹음 시간 도달로 자동 종료했다 (413 meeting_too_long).
  onMeetingTooLong(): void;
  // 세그먼트 정합 붕괴(chunk_gap 등) — 호출측이 recorder 를 재시작해 새
  // 세그먼트로 이어가야 한다.
  onSegmentBroken(): void;
  // 세션 만료 — refresh 까지 실패. 녹음을 중단해야 한다.
  onSessionExpired(): void;
  // 서버 힌트: 세그먼트가 길어졌으니 다음 기회에 로테이션.
  onRotateSuggested(): void;
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000];
const STALLED_RETRY_MS = 30_000;

export class ChunkUploadQueue {
  private queue: QueuedChunk[] = [];
  private pumping = false;
  private stopped = false;
  private health: UploadHealth = "idle";
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private onlineListener: (() => void) | null = null;

  constructor(
    private readonly meetingId: string,
    private readonly callbacks: ChunkQueueCallbacks
  ) {}

  push(chunk: QueuedChunk): void {
    if (this.stopped) return;
    this.queue.push(chunk);
    this.callbacks.onPendingChange(this.queue.length);
    void this.pump();
  }

  get pending(): number {
    return this.queue.length;
  }

  // stop 플로우 전용 — 남은 청크가 모두 올라가길 기다린다. timeoutMs 안에
  // 못 비우면 "stuck" (호출측이 사용자에게 누락 감수 여부를 confirm).
  async drain(timeoutMs: number): Promise<"drained" | "stuck"> {
    const deadline = Date.now() + timeoutMs;
    while (this.queue.length > 0 && !this.stopped) {
      if (Date.now() > deadline) return "stuck";
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return this.queue.length === 0 ? "drained" : "stuck";
  }

  // 미전송 청크 폐기 후 정지 (fatal 경로 / 누락 감수 종료).
  stop(): void {
    this.stopped = true;
    this.queue = [];
    this.callbacks.onPendingChange(0);
    this.clearRetryHooks();
    this.setHealth("idle");
  }

  private setHealth(health: UploadHealth): void {
    if (this.health === health) return;
    this.health = health;
    this.callbacks.onHealthChange(health);
  }

  private clearRetryHooks(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.onlineListener) {
      window.removeEventListener("online", this.onlineListener);
      this.onlineListener = null;
    }
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.stopped) return;
    this.pumping = true;
    try {
      while (this.queue.length > 0 && !this.stopped) {
        const head = this.queue[0];
        const outcome = await this.uploadWithRetry(head);
        if (outcome === "sent") {
          this.queue.shift();
          this.callbacks.onPendingChange(this.queue.length);
          continue;
        }
        if (outcome === "fatal") {
          this.stop();
          return;
        }
        // "stalled" — 백오프 소진. head 를 유지한 채 30초 후/online 시 재개.
        this.setHealth("failed");
        this.scheduleStalledRetry();
        return;
      }
      this.setHealth("idle");
    } finally {
      this.pumping = false;
    }
  }

  private scheduleStalledRetry(): void {
    this.clearRetryHooks();
    const resume = () => {
      this.clearRetryHooks();
      void this.pump();
    };
    this.retryTimer = setTimeout(resume, STALLED_RETRY_MS);
    this.onlineListener = resume;
    window.addEventListener("online", this.onlineListener);
  }

  private async uploadWithRetry(
    chunk: QueuedChunk
  ): Promise<"sent" | "stalled" | "fatal"> {
    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      if (this.stopped) return "fatal";
      this.setHealth(attempt === 0 ? "uploading" : "retrying");
      try {
        const result = await meetingService.uploadChunk(this.meetingId, chunk.blob, {
          segIndex: chunk.segIndex,
          seq: chunk.seq,
          durationMs: chunk.durationMs
        });
        if (result.rotateSuggested) this.callbacks.onRotateSuggested();
        return "sent";
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 413 && err.message === "meeting_too_long") {
            // 서버가 이미 자동 finish — 이 청크까지는 보존됨.
            this.callbacks.onMeetingTooLong();
            return "fatal";
          }
          if (err.status === 401) {
            // uploadChunk 내부의 refresh 1회까지 실패한 상태 = 세션 사망.
            this.callbacks.onSessionExpired();
            return "fatal";
          }
          if (
            err.status === 409 &&
            (err.message === "chunk_gap" || err.message === "segment_too_long")
          ) {
            this.callbacks.onSegmentBroken();
            return "fatal";
          }
          if (err.status === 409 && err.message === "not_recording") {
            // 원격 종료/취소 뒤에 도착한 꼬리 청크 — 조용히 폐기.
            return "fatal";
          }
          if (err.status === 404 || err.status === 403) {
            return "fatal";
          }
        }
        // 네트워크 오류/5xx — 백오프 후 재시도.
        if (attempt < BACKOFF_MS.length) {
          await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS[attempt]));
          continue;
        }
        return "stalled";
      }
    }
    return "stalled";
  }
}
