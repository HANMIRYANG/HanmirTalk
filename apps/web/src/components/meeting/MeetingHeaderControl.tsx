"use client";

// 채팅방 헤더의 회의 녹음 컨트롤. 상태별 UI:
//   비녹음        — [회의 시작] 버튼
//   내가 녹음 중  — 빨간 점 + 경과시간 + [회의 종료]
//   종료 처리 중  — disabled [종료 중…]
//   남이 녹음 중  — "● 녹음 중 · 이름 · 경과" 배지 (+ admin 이면 종료)
//   고아(내 녹음, recorder 없음) — "이어서 녹음" / "회의 종료" 프롬프트
//   PPT 대기      — "전사 완료" 안내 바 + [PPT 업로드] / [건너뛰기]
//   회의록 생성 중 — 파란 배지
//
// SSR prop(activeMeeting)과 Provider(로컬 recorder)의 병합 규칙:
// mine ?? ssrActive. lastFinishedMeetingId 가드로 finish 직후 stale SSR
// prop 깜빡임을 억제하고, 모든 액션 후 router.refresh 로 동기화한다.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Meeting } from "@hanmir/shared";
import { MicIcon } from "@/components/ui/icons";
import { ApiError } from "@/services/api-client";
import { meetingService } from "@/services/meeting.service";
import {
  formatElapsed,
  useMeetingRecorder,
  useMeetingRecorderActions
} from "./MeetingRecorderProvider";
import styles from "./MeetingHeaderControl.module.css";

interface MeetingHeaderControlProps {
  roomId: string;
  roomName: string;
  activeMeeting: Meeting | null;
  currentUserId: string;
  isAdmin: boolean;
}

const PROCESSING_STATUSES: Meeting["status"][] = [
  "pending",
  "transcribing",
  "summarizing",
  "generating_docs"
];

// 1초 tick 경과시간 — Provider state 가 아니라 소비자 로컬 계산 (전역
// 리렌더 방지).
function useElapsed(sinceMs: number | null): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (sinceMs === null) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [sinceMs]);
  if (sinceMs === null) return "";
  return formatElapsed(Date.now() - sinceMs);
}

export function MeetingHeaderControl({
  roomId,
  roomName,
  activeMeeting,
  currentUserId,
  isAdmin
}: MeetingHeaderControlProps) {
  const router = useRouter();
  const recorder = useMeetingRecorder();
  const actions = useMeetingRecorderActions();

  const mine =
    recorder.recording && recorder.recording.roomId === roomId
      ? recorder.recording
      : null;
  const ssrActive =
    activeMeeting && activeMeeting.id !== recorder.lastFinishedMeetingId
      ? activeMeeting
      : null;

  const recordingElapsed = useElapsed(
    mine
      ? mine.startedAtMs
      : ssrActive?.status === "recording"
      ? Date.parse(ssrActive.startedAt)
      : null
  );

  const onStart = useCallback(async () => {
    await actions.start(roomId, roomName);
    router.refresh();
  }, [actions, roomId, roomName, router]);

  const onStop = useCallback(async () => {
    await actions.stop();
    router.refresh();
  }, [actions, router]);

  const onResume = useCallback(async () => {
    if (!ssrActive) return;
    await actions.resume(ssrActive, roomName);
    router.refresh();
  }, [actions, ssrActive, roomName, router]);

  const onFinishRemote = useCallback(async () => {
    if (!ssrActive) return;
    if (!window.confirm("진행 중인 회의 녹음을 종료할까요?")) return;
    await actions.finishRemote(ssrActive.id);
    router.refresh();
  }, [actions, ssrActive, router]);

  // ── awaiting_ppt: 부서별 PPT 업로드 / 건너뛰기 ──
  const pptInputRef = useRef<HTMLInputElement>(null);
  const [pptBusy, setPptBusy] = useState(false);

  const onPptFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // 같은 파일 재선택도 change 가 뜨게 리셋
      if (!file || !ssrActive) return;
      setPptBusy(true);
      try {
        await meetingService.uploadPpt(ssrActive.id, file);
      } catch (error) {
        if (error instanceof ApiError && error.status === 422) {
          window.alert(
            "PPTX 파일을 읽을 수 없습니다. 파일을 확인한 뒤 다시 업로드해 주세요."
          );
        } else if (error instanceof ApiError && error.status === 409) {
          // 이미 진행됨 (건너뛰기/타임아웃 선행) — refresh 로 상태만 동기화
        } else {
          window.alert("PPT 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        }
      } finally {
        setPptBusy(false);
        router.refresh();
      }
    },
    [ssrActive, router]
  );

  const onSkipPpt = useCallback(async () => {
    if (!ssrActive) return;
    if (!window.confirm("PPT 없이 회의록을 생성할까요?")) return;
    setPptBusy(true);
    try {
      await meetingService.skipPpt(ssrActive.id);
    } catch {
      // 409(이미 진행됨) 포함 — refresh 로 상태 동기화
    } finally {
      setPptBusy(false);
      router.refresh();
    }
  }, [ssrActive, router]);

  // ── 내가 이 탭에서 녹음 중 ──
  if (mine && (recorder.phase === "recording" || recorder.phase === "stopping")) {
    const stopping = recorder.phase === "stopping";
    return (
      <div className={styles.wrap}>
        <span className={styles.dot} aria-hidden />
        <span className={styles.elapsed}>{recordingElapsed}</span>
        <button
          type="button"
          className={`btn btn--sm ${styles.endBtn}`}
          onClick={() => void onStop()}
          disabled={stopping}
        >
          {stopping ? "종료 중…" : "회의 종료"}
        </button>
        {recorder.uploadHealth === "retrying" || recorder.uploadHealth === "failed" ? (
          <span className={styles.uploadAlert} role="alert">
            오디오 업로드 재시도 중{recorder.pendingChunks > 0 ? ` (${recorder.pendingChunks}개 대기)` : ""}
          </span>
        ) : null}
      </div>
    );
  }

  if (ssrActive && ssrActive.status === "recording") {
    const isStarter = ssrActive.startedBy === currentUserId;
    // ── 내 녹음인데 이 탭에 recorder 가 없다 (새로고침/탭 크래시) ──
    // 다른 탭이 살아 있으면(하트비트) 프롬프트를 띄우지 않는다.
    if (isStarter && !actions.isTabRecording(ssrActive.id)) {
      return (
        <div className={styles.resumeBar} role="alert">
          <span>녹음이 중단되었습니다.</span>
          <button type="button" className={styles.resumeBtn} onClick={() => void onResume()}>
            이어서 녹음
          </button>
          <button type="button" className={styles.resumeBtn} onClick={() => void onFinishRemote()}>
            회의 종료
          </button>
        </div>
      );
    }
    // ── 남이 녹음 중 (또는 내 녹음이 다른 탭에서 진행 중) ──
    return (
      <div className={styles.wrap}>
        <span className="tag tag--red">
          <span className={styles.dot} aria-hidden /> 녹음 중
          {ssrActive.startedByName ? ` · ${ssrActive.startedByName}` : ""}
          {recordingElapsed ? ` · ${recordingElapsed}` : ""}
        </span>
        {isAdmin && !isStarter ? (
          <button
            type="button"
            className={`btn btn--sm ${styles.endBtn}`}
            onClick={() => void onFinishRemote()}
          >
            종료
          </button>
        ) : null}
      </div>
    );
  }

  // ── 전사 완료, 부서별 PPT 대기 ──
  // 안내 바는 방 전원에게 보이고, 버튼은 시작자/관리자만 활성.
  if (ssrActive && ssrActive.status === "awaiting_ppt") {
    const canAct = ssrActive.startedBy === currentUserId || isAdmin;
    return (
      <div className={styles.resumeBar} role="alert">
        <span>전사 완료 — 부서별 PPT(.pptx)를 업로드해 주세요</span>
        <input
          ref={pptInputRef}
          type="file"
          accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          hidden
          onChange={(e) => void onPptFileChange(e)}
        />
        <button
          type="button"
          className={styles.resumeBtn}
          disabled={!canAct || pptBusy}
          onClick={() => pptInputRef.current?.click()}
        >
          {pptBusy ? "업로드 중…" : "PPT 업로드"}
        </button>
        <button
          type="button"
          className={styles.resumeBtn}
          disabled={!canAct || pptBusy}
          onClick={() => void onSkipPpt()}
        >
          건너뛰기
        </button>
      </div>
    );
  }

  // ── 회의록 생성 중 ──
  if (ssrActive && PROCESSING_STATUSES.includes(ssrActive.status)) {
    return (
      <div className={styles.wrap}>
        <span className="tag tag--blue">회의록 생성 중…</span>
      </div>
    );
  }

  // ── 비녹음 ──
  const busy = recorder.phase === "acquiring" || recorder.recording !== null;
  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={`btn btn--ghost btn--sm ${styles.startBtn}`}
        onClick={() => void onStart()}
        disabled={busy}
        title="회의 녹음을 시작합니다. 녹음은 자동 전사되어 회의록으로 정리됩니다."
      >
        <MicIcon size={14} /> 회의 시작
      </button>
    </div>
  );
}
