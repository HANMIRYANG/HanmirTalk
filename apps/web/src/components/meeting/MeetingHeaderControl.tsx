"use client";

// 채팅방 헤더의 회의 녹음 컨트롤. 상태별 UI:
//   비녹음        — [회의 시작] 버튼 (+ PPT 대기 배지 버튼 + 생성중 배지)
//   내가 녹음 중  — 빨간 점 + 경과시간 + [회의 종료]
//   종료 처리 중  — disabled [종료 중…]
//   남이 녹음 중  — "● 녹음 중 · 이름 · 경과" 배지 (+ admin 이면 종료)
//   고아(내 녹음, recorder 없음) — "이어서 녹음" / "회의 종료" 프롬프트
//
// awaiting_ppt/처리중 상태는 헤더를 점유하지 않는다 — 같은 방에서 연속
// 회의를 바로 시작할 수 있도록 [회의 시작] 을 막지 않고, PPT 대기 회의는
// 옆의 "PPT 대기 N" 버튼 → PptWaitModal 에서 일괄 처리한다.
//
// SSR prop(activeMeeting)과 Provider(로컬 recorder)의 병합 규칙:
// mine ?? ssrActive. lastFinishedMeetingId 가드로 finish 직후 stale SSR
// prop 깜빡임을 억제하고, 모든 액션 후 router.refresh 로 동기화한다.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Meeting } from "@hanmir/shared";
import { MicIcon } from "@/components/ui/icons";
import { confirmDialog } from "@/components/ui/AppDialogHost";
import {
  formatElapsed,
  useMeetingRecorder,
  useMeetingRecorderActions
} from "./MeetingRecorderProvider";
import { PptWaitModal } from "./PptWaitModal";
import styles from "./MeetingHeaderControl.module.css";

interface MeetingHeaderControlProps {
  roomId: string;
  roomName: string;
  activeMeeting: Meeting | null;
  // 방의 awaiting_ppt 회의 수 / 파이프라인 처리중(전사·요약·문서화) 회의 수
  // — page.tsx 가 SSR 로 채우고 meeting:updated → router.refresh 로 갱신.
  awaitingPptCount: number;
  processingCount: number;
  currentUserId: string;
  isAdmin: boolean;
}

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
  awaitingPptCount,
  processingCount,
  currentUserId,
  isAdmin
}: MeetingHeaderControlProps) {
  const router = useRouter();
  const recorder = useMeetingRecorder();
  const actions = useMeetingRecorderActions();
  const [pptModalOpen, setPptModalOpen] = useState(false);

  const mine =
    recorder.recording && recorder.recording.roomId === roomId
      ? recorder.recording
      : null;
  // lastFinishedMeetingId 가드는 "내가 방금 종료했는데 SSR prop 이 아직
  // recording 이라고 주장하는" stale 깜빡임만 억제한다 (비 recording
  // 상태는 헤더를 점유하지 않으므로 그 외에는 가드가 필요 없다).
  const ssrActive =
    activeMeeting &&
    !(
      activeMeeting.id === recorder.lastFinishedMeetingId &&
      activeMeeting.status === "recording"
    )
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
    if (!(await confirmDialog("진행 중인 회의 녹음을 종료할까요?", { danger: true }))) return;
    await actions.finishRemote(ssrActive.id);
    router.refresh();
  }, [actions, ssrActive, router]);

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

  // ── 비녹음 — 회의 시작은 항상 가능 (PPT 대기/생성중은 비차단 표시) ──
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
      {awaitingPptCount > 0 ? (
        <button
          type="button"
          className={`btn btn--ghost btn--sm ${styles.pptWaitBtn}`}
          onClick={() => setPptModalOpen(true)}
          title="전사가 끝난 회의에 부서별 PPT를 첨부하거나 건너뛸 수 있습니다."
        >
          PPT 대기 <span className={styles.badge}>{awaitingPptCount}</span>
        </button>
      ) : null}
      {processingCount > 0 ? (
        <span className="tag tag--blue" title="전사·회의록 생성이 진행 중입니다.">
          회의록 생성 중
        </span>
      ) : null}
      <PptWaitModal
        roomId={roomId}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        open={pptModalOpen}
        onClose={() => setPptModalOpen(false)}
      />
    </div>
  );
}
