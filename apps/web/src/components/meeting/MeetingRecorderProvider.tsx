"use client";

// 회의 녹음 엔진 — (app) 레이아웃 레벨 전역 Context.
//
// MediaRecorder / MediaStream / 업로드 큐를 방 페이지가 아니라 앱 셸에
// 두는 이유: App Router SPA 네비게이션으로 방을 벗어나도 녹음·청크
// 업로드가 끊기지 않아야 한다 (회의 중 다른 방 확인이 실사용 패턴).
// 방 밖에서는 GlobalRecordingIndicator 가 상태를 표시한다.
//
// 상태/액션 컨텍스트 분리는 UnreadBadgesProvider 선례. 경과시간은 state
// 에 두지 않는다 — Provider 가 앱 전체를 감싸므로 1초 tick 이 전역
// 리렌더가 된다. 소비자가 startedAtMs 로 각자 로컬 계산.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { Meeting, MeetingStatus } from "@hanmir/shared";
import { ApiError } from "@/services/api-client";
import { meetingService } from "@/services/meeting.service";
import { getSocket } from "@/lib/socket";
import { ChunkUploadQueue, type UploadHealth } from "./chunk-upload-queue";

export type RecorderPhase = "idle" | "acquiring" | "recording" | "stopping";

export interface ActiveLocalRecording {
  meetingId: string;
  roomId: string;
  roomName: string;
  // 서버 시각 기준 — 경과시간 표시와 4시간 컷의 기준.
  startedAtMs: number;
}

export interface MeetingRecorderState {
  phase: RecorderPhase;
  // "이 탭에서 내가 녹음 중"일 때만 non-null.
  recording: ActiveLocalRecording | null;
  uploadHealth: UploadHealth;
  pendingChunks: number;
  // finish 직후 SSR prop 이 아직 recording 을 가리키는 깜빡임 억제용.
  lastFinishedMeetingId: string | null;
}

export interface MeetingRecorderActions {
  start(roomId: string, roomName: string): Promise<void>;
  resume(meeting: Meeting, roomName: string): Promise<void>;
  stop(): Promise<void>;
  // 관리자가 남의 회의를 종료 (로컬 recorder 없음, finish API 만).
  finishRemote(meetingId: string): Promise<void>;
  // BroadcastChannel 하트비트 — 다른 탭이 이 회의를 녹음 중인지.
  isTabRecording(meetingId: string): boolean;
}

const MAX_MEETING_MS =
  Number(process.env.NEXT_PUBLIC_MEETING_MAX_HOURS ?? 4) * 60 * 60 * 1000;
// timeslice — 기본 5분. 개발 검증 시 NEXT_PUBLIC_MEETING_CHUNK_MS 로 단축
// (NEXT_PUBLIC 이라 빌드타임 인라인).
const CHUNK_TIMESLICE_MS = Number(process.env.NEXT_PUBLIC_MEETING_CHUNK_MS ?? 300_000);
const HEARTBEAT_CHANNEL = "hanmir:meeting-recorder";
const HEARTBEAT_INTERVAL_MS = 5_000;
const HEARTBEAT_FRESH_MS = 15_000;
const DRAIN_TIMEOUT_MS = 60_000;

const defaultState: MeetingRecorderState = {
  phase: "idle",
  recording: null,
  uploadHealth: "idle",
  pendingChunks: 0,
  lastFinishedMeetingId: null
};

const StateContext = createContext<MeetingRecorderState>(defaultState);
const ActionsContext = createContext<MeetingRecorderActions>({
  start: async () => {},
  resume: async () => {},
  stop: async () => {},
  finishRemote: async () => {},
  isTabRecording: () => false
});

export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  return undefined;
}

export function MeetingRecorderProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MeetingRecorderState>(defaultState);

  // 렌더 무관 리소스는 전부 ref.
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const queueRef = useRef<ChunkUploadQueue | null>(null);
  const segIndexRef = useRef(0);
  const nextSeqRef = useRef(0);
  const lastChunkAtRef = useRef(0);
  const rotateRequestedRef = useRef(false);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const peerHeartbeatsRef = useRef<Map<string, number>>(new Map());
  const recordingRef = useRef<ActiveLocalRecording | null>(null);
  const stoppingRef = useRef(false);

  const patchState = useCallback((patch: Partial<MeetingRecorderState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  // ── 멀티탭 하트비트 ─────────────────────────────────────────────
  // 녹음 탭이 5초마다 meetingId 를 브로드캐스트. 다른 탭은 이걸 보고
  // "내 녹음인데 이 탭엔 recorder 없음" 상황에서 재개 프롬프트를 억제해
  // 이중 녹음을 막는다.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(HEARTBEAT_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (e: MessageEvent) => {
      const data = e.data as { meetingId?: string; ts?: number } | undefined;
      if (data?.meetingId && typeof data.ts === "number") {
        peerHeartbeatsRef.current.set(data.meetingId, data.ts);
      }
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  const isTabRecording = useCallback((meetingId: string): boolean => {
    if (recordingRef.current?.meetingId === meetingId) return true;
    const last = peerHeartbeatsRef.current.get(meetingId);
    return last !== undefined && Date.now() - last < HEARTBEAT_FRESH_MS;
  }, []);

  // ── beforeunload — 녹음 중/업로드 잔량 있을 때만 이탈 경고 ───────
  useEffect(() => {
    const needsGuard =
      state.phase === "recording" ||
      state.phase === "stopping" ||
      state.pendingChunks > 0;
    if (!needsGuard) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state.phase, state.pendingChunks]);

  // ── 리소스 정리 (공통) ──────────────────────────────────────────
  const cleanupLocal = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // already stopped
      }
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    recordingRef.current = null;
    stoppingRef.current = false;
  }, []);

  const resetToIdle = useCallback(
    (finishedMeetingId?: string) => {
      queueRef.current?.stop();
      queueRef.current = null;
      cleanupLocal();
      setState({
        phase: "idle",
        recording: null,
        uploadHealth: "idle",
        pendingChunks: 0,
        lastFinishedMeetingId: finishedMeetingId ?? null
      });
    },
    [cleanupLocal]
  );

  // ── stop (정상 종료) ────────────────────────────────────────────
  const stop = useCallback(async () => {
    const active = recordingRef.current;
    if (!active || stoppingRef.current) return;
    stoppingRef.current = true;
    patchState({ phase: "stopping" });
    try {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        // onstop 대기 — 마지막 ondataavailable(final chunk)이 먼저 발화한다.
        await new Promise<void>((resolve) => {
          recorder.addEventListener("stop", () => resolve(), { once: true });
          recorder.stop();
        });
      }
      const queue = queueRef.current;
      if (queue) {
        const drained = await queue.drain(DRAIN_TIMEOUT_MS);
        if (drained === "stuck") {
          const discard = window.confirm(
            "일부 오디오 업로드에 실패했습니다. 그래도 회의를 종료할까요?\n실패한 구간은 회의록에서 누락됩니다."
          );
          if (!discard) {
            // 재시도 계속 — stopping 상태 유지한 채 한 번 더 기다린다.
            const retry = await queue.drain(DRAIN_TIMEOUT_MS);
            if (retry === "stuck") {
              window.alert("업로드가 계속 실패해 미전송 구간을 제외하고 종료합니다.");
            }
          }
        }
      }
      await meetingService.finishMeeting(active.meetingId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.alert("세션이 만료되었습니다. 다시 로그인해 주세요.");
      } else {
        window.alert("회의 종료 처리에 실패했습니다. 회의는 30분 후 자동 종료됩니다.");
      }
    } finally {
      resetToIdle(active.meetingId);
    }
  }, [patchState, resetToIdle]);

  const stopRef = useRef(stop);
  stopRef.current = stop;

  // ── 원격 종료 감지 — 시작자의 user 채널로 오는 meeting:updated ───
  // 방 페이지 밖에 있어도(room 채널 미구독) recorder 를 정리해야 하므로
  // Provider 가 직접 구독한다.
  useEffect(() => {
    const socket = getSocket();
    const onMeetingUpdated = (payload: {
      id: string;
      status: MeetingStatus;
    }) => {
      const active = recordingRef.current;
      if (!active || payload.id !== active.meetingId) return;
      if (payload.status === "recording") return;
      // awaiting_ppt(전사 완료, PPT 대기)는 종료가 아니다 — 정상적으로는
      // stop() 의 resetToIdle 이 먼저라 여기 도달하지 않지만 방어적으로 제외.
      if (payload.status === "awaiting_ppt") return;
      if (stoppingRef.current) return; // 내가 종료 중 — 정상 흐름
      // 관리자 원격 종료/취소 or 서버 자동 종료 — finish 호출 없이 정리만.
      resetToIdle(active.meetingId);
      window.alert("회의가 종료되었습니다.");
    };
    socket.on("meeting:updated", onMeetingUpdated);
    return () => {
      socket.off("meeting:updated", onMeetingUpdated);
    };
  }, [resetToIdle]);

  // ── 세그먼트 로테이션 (55분 힌트/chunk_gap 복구 공용) ────────────
  // 같은 MediaStream 을 유지한 채 recorder 만 재시작 — 새 세그먼트는 새
  // WebM 헤더를 가져야 하므로 반드시 새 MediaRecorder 세션이어야 한다.
  const rotateSegment = useCallback(async () => {
    const active = recordingRef.current;
    const stream = streamRef.current;
    if (!active || !stream || stoppingRef.current) return;
    try {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        await new Promise<void>((resolve) => {
          recorder.addEventListener("stop", () => resolve(), { once: true });
          recorder.stop();
        });
      }
      const { segIndex } = await meetingService.startSegment(active.meetingId);
      segIndexRef.current = segIndex;
      nextSeqRef.current = 0;
      startRecorder(stream);
    } catch {
      window.alert("녹음 구간 전환에 실패해 회의를 종료합니다.");
      void stopRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── MediaRecorder 구동 ──────────────────────────────────────────
  function startRecorder(stream: MediaStream): void {
    const mimeType = pickMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    recorderRef.current = recorder;
    rotateRequestedRef.current = false;
    lastChunkAtRef.current = Date.now();

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size === 0) return;
      const active = recordingRef.current;
      const queue = queueRef.current;
      if (!active || !queue) return;
      // duration 은 클라이언트 보고 근사치 — 직전 청크 이후 경과 시간.
      const now = Date.now();
      const durationMs = Math.min(
        Math.max(now - lastChunkAtRef.current, 0),
        CHUNK_TIMESLICE_MS * 2
      );
      lastChunkAtRef.current = now;
      queue.push({
        blob: e.data,
        segIndex: segIndexRef.current,
        seq: nextSeqRef.current++,
        durationMs
      });
      // 서버 rotateSuggested — 이번 청크가 큐에 들어간 뒤 로테이션.
      if (rotateRequestedRef.current && !stoppingRef.current) {
        rotateRequestedRef.current = false;
        void rotateSegment();
      }
    };
    recorder.onerror = () => {
      window.alert("녹음 장치 오류가 발생해 회의를 종료합니다.");
      void stopRef.current();
    };
    const track = stream.getAudioTracks()[0];
    if (track) {
      track.addEventListener(
        "ended",
        () => {
          if (stoppingRef.current) return;
          window.alert("마이크 연결이 끊겨 회의를 종료합니다.");
          void stopRef.current();
        },
        { once: true }
      );
    }
    recorder.start(CHUNK_TIMESLICE_MS);
  }

  // ── 공통 시작 경로 (start/resume 이 공유) ───────────────────────
  const beginRecording = useCallback(
    async (
      meeting: Meeting,
      roomId: string,
      roomName: string,
      stream: MediaStream,
      segIndex: number
    ) => {
      const active: ActiveLocalRecording = {
        meetingId: meeting.id,
        roomId,
        roomName,
        startedAtMs: Date.parse(meeting.startedAt)
      };
      recordingRef.current = active;
      streamRef.current = stream;
      segIndexRef.current = segIndex;
      nextSeqRef.current = 0;

      queueRef.current = new ChunkUploadQueue(meeting.id, {
        onHealthChange: (health) => patchState({ uploadHealth: health }),
        onPendingChange: (pending) => patchState({ pendingChunks: pending }),
        onMeetingTooLong: () => {
          // 서버가 이미 finish — recorder 만 정리.
          resetToIdle(meeting.id);
          window.alert(
            "최대 녹음 시간에 도달하여 회의가 자동 종료되었습니다. 회의록을 생성합니다."
          );
        },
        onSegmentBroken: () => {
          // 청크 유실로 세그먼트 정합 붕괴 — 새 세그먼트로 이어간다.
          void rotateSegment();
        },
        onSessionExpired: () => {
          resetToIdle();
          window.alert(
            "세션이 만료되어 녹음이 중단되었습니다. 다시 로그인 후 '이어서 녹음'으로 재개할 수 있습니다."
          );
        },
        onRotateSuggested: () => {
          rotateRequestedRef.current = true;
        }
      });

      startRecorder(stream);

      // 4시간(회의 전체 기준) 자동 종료 — 서버도 거부하지만 클라 선제.
      const remain = Math.max(active.startedAtMs + MAX_MEETING_MS - Date.now(), 5_000);
      maxTimerRef.current = setTimeout(() => {
        window.alert("최대 녹음 시간(4시간)에 도달하여 회의를 자동 종료합니다.");
        void stopRef.current();
      }, remain);

      // 멀티탭 하트비트 송신.
      heartbeatTimerRef.current = setInterval(() => {
        channelRef.current?.postMessage({ meetingId: meeting.id, ts: Date.now() });
      }, HEARTBEAT_INTERVAL_MS);
      channelRef.current?.postMessage({ meetingId: meeting.id, ts: Date.now() });

      patchState({
        phase: "recording",
        recording: active,
        uploadHealth: "idle",
        pendingChunks: 0,
        lastFinishedMeetingId: null
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patchState, resetToIdle, rotateSegment]
  );

  // 마이크 획득 — 회의 생성보다 먼저 (거부 시 유령 회의를 안 만든다).
  const acquireMic = useCallback(async (): Promise<MediaStream | null> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      window.alert("이 브라우저에서는 녹음을 사용할 수 없습니다. (보안 컨텍스트/미지원)");
      return null;
    }
    if (!pickMimeType()) {
      window.alert("이 브라우저는 WebM 오디오 녹음을 지원하지 않습니다. Chrome/Edge 를 사용해 주세요.");
      return null;
    }
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError") {
        window.alert(
          "마이크 권한이 거부되었습니다. 브라우저 주소창의 권한 설정에서 허용해 주세요."
        );
      } else if (name === "NotFoundError") {
        window.alert("사용 가능한 마이크를 찾을 수 없습니다.");
      } else {
        window.alert("마이크를 사용할 수 없습니다.");
      }
      return null;
    }
  }, []);

  const start = useCallback(
    async (roomId: string, roomName: string) => {
      if (recordingRef.current || stoppingRef.current) {
        window.alert("이미 다른 방에서 녹음 중입니다.");
        return;
      }
      patchState({ phase: "acquiring" });
      const stream = await acquireMic();
      if (!stream) {
        patchState({ phase: "idle" });
        return;
      }
      let meeting: Meeting;
      try {
        meeting = await meetingService.startMeeting(roomId);
      } catch (err) {
        stream.getTracks().forEach((t) => t.stop());
        patchState({ phase: "idle" });
        if (err instanceof ApiError && err.status === 409) {
          window.alert("이 방에는 이미 진행 중인 회의가 있습니다.");
        } else if (err instanceof ApiError && err.status === 503) {
          window.alert("회의록 AI 가 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.");
        } else {
          window.alert("회의 시작에 실패했습니다.");
        }
        return;
      }
      await beginRecording(meeting, roomId, roomName, stream, meeting.currentSegIndex);
    },
    [acquireMic, beginRecording, patchState]
  );

  // 새로고침으로 recorder 가 죽은 내 녹음 재개 — 서버에 새 세그먼트를
  // 만들고 새 MediaRecorder 를 시작한다. 경과/4h 컷은 원래 시작 시각 기준.
  const resume = useCallback(
    async (meeting: Meeting, roomName: string) => {
      if (recordingRef.current || stoppingRef.current) {
        window.alert("이미 녹음 중입니다.");
        return;
      }
      if (!meeting.roomId) return;
      patchState({ phase: "acquiring" });
      const stream = await acquireMic();
      if (!stream) {
        patchState({ phase: "idle" });
        return;
      }
      try {
        const { segIndex } = await meetingService.startSegment(meeting.id);
        await beginRecording(meeting, meeting.roomId, roomName, stream, segIndex);
      } catch (err) {
        stream.getTracks().forEach((t) => t.stop());
        patchState({ phase: "idle" });
        if (err instanceof ApiError && err.status === 409) {
          // 이미 종료된 회의 — 헤더가 refresh 로 상태를 따라잡는다.
          return;
        }
        window.alert("녹음 재개에 실패했습니다.");
      }
    },
    [acquireMic, beginRecording, patchState]
  );

  const finishRemote = useCallback(
    async (meetingId: string) => {
      try {
        await meetingService.finishMeeting(meetingId);
        patchState({ lastFinishedMeetingId: meetingId });
      } catch {
        window.alert("회의 종료에 실패했습니다.");
      }
    },
    [patchState]
  );

  const actions = useMemo<MeetingRecorderActions>(
    () => ({ start, resume, stop, finishRemote, isTabRecording }),
    [start, resume, stop, finishRemote, isTabRecording]
  );

  return (
    <StateContext.Provider value={state}>
      <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
    </StateContext.Provider>
  );
}

export function useMeetingRecorder(): MeetingRecorderState {
  return useContext(StateContext);
}

export function useMeetingRecorderActions(): MeetingRecorderActions {
  return useContext(ActionsContext);
}
