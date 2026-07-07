import type { Meeting } from "@hanmir/shared";
import { ApiError, apiBaseUrl, apiRequest, attemptRefresh } from "./api-client";
import type { AuthOptions } from "./chat.service";

export interface ChunkUploadResult {
  ok: boolean;
  duplicate?: boolean;
  segIndex: number;
  receivedSeq: number;
  totalDurationMs: number;
  // 세그먼트가 55분을 넘었다 — 다음 timeslice 에 recorder 를 재시작해
  // 새 세그먼트(새 WebM 헤더)로 로테이션하라는 서버 힌트.
  rotateSuggested: boolean;
}

export const meetingService = {
  async startMeeting(roomId: string, title?: string): Promise<Meeting> {
    return apiRequest<Meeting>("/meetings", {
      method: "POST",
      body: { roomId, title }
    });
  },
  // 새로고침 복원 + "회의록 생성 중" 배지용. recording 우선, 없으면 최신
  // 파이프라인 진행중 회의. SSR(page.tsx)에서 token 옵션으로도 호출된다.
  async getActiveMeeting(roomId: string, opts: AuthOptions = {}): Promise<Meeting | null> {
    return apiRequest<Meeting | null>("/meetings/active", {
      token: opts.token,
      query: { roomId }
    });
  },
  async getMeeting(id: string): Promise<Meeting> {
    return apiRequest<Meeting>(`/meetings/${encodeURIComponent(id)}`);
  },
  // 새로고침 재개 / 60분 로테이션 — 새 MediaRecorder 세션 = 새 세그먼트.
  async startSegment(meetingId: string): Promise<{ segIndex: number }> {
    return apiRequest<{ segIndex: number }>(
      `/meetings/${encodeURIComponent(meetingId)}/segments`,
      { method: "POST" }
    );
  },
  async finishMeeting(meetingId: string): Promise<Meeting> {
    return apiRequest<Meeting>(`/meetings/${encodeURIComponent(meetingId)}/finish`, {
      method: "POST",
      expectStatus: [202]
    });
  },
  async cancelMeeting(meetingId: string): Promise<void> {
    await apiRequest<{ ok: boolean }>(`/meetings/${encodeURIComponent(meetingId)}/cancel`, {
      method: "POST"
    });
  },
  // Multipart 는 apiRequest 를 우회한다 (file.service.uploadFile 과 동일한
  // 이유 — FormData 가 multipart boundary 를 직접 소유해야 함). 401 은
  // api-client 의 single-flight refresh 를 1회 태우고 재시도.
  async uploadChunk(
    meetingId: string,
    chunk: Blob,
    meta: { segIndex: number; seq: number; durationMs: number },
    didRetry = false
  ): Promise<ChunkUploadResult> {
    const form = new FormData();
    form.append(
      "chunk",
      new File([chunk], `chunk-${meta.segIndex}-${meta.seq}.webm`, {
        type: chunk.type || "audio/webm"
      })
    );
    form.append("segIndex", String(meta.segIndex));
    form.append("seq", String(meta.seq));
    form.append("durationMs", String(meta.durationMs));

    let response: Response;
    try {
      response = await fetch(
        `${apiBaseUrl}/meetings/${encodeURIComponent(meetingId)}/chunks`,
        {
          method: "POST",
          body: form,
          headers: { Accept: "application/json" },
          credentials: "include"
        }
      );
    } catch (error) {
      throw new ApiError(0, "Network error while uploading chunk", error);
    }

    if (response.status === 401 && !didRetry) {
      const ok = await attemptRefresh();
      if (ok) return this.uploadChunk(meetingId, chunk, meta, true);
    }

    const isJson = response.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await response.json().catch(() => undefined) : undefined;

    if (!response.ok) {
      const message =
        (payload && typeof payload === "object" && "error" in (payload as Record<string, unknown>)
          ? String((payload as Record<string, unknown>).error)
          : undefined) ?? `Chunk upload failed (${response.status})`;
      throw new ApiError(response.status, message, payload);
    }
    return payload as ChunkUploadResult;
  }
};
