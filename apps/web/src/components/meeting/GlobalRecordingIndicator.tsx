"use client";

// 녹음 중인데 해당 방 페이지가 아닐 때 표시되는 플로팅 pill — 클릭 시
// 녹음 중인 방으로 이동. 헤더가 이미 상태를 보여주는 방 페이지에서는
// 숨긴다. AppShell(MeetingRecorderProvider 내부)에서 렌더된다.
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  formatElapsed,
  useMeetingRecorder
} from "./MeetingRecorderProvider";
import styles from "./GlobalRecordingIndicator.module.css";

export function GlobalRecordingIndicator() {
  const pathname = usePathname();
  const router = useRouter();
  const { phase, recording, uploadHealth } = useMeetingRecorder();
  const [, setTick] = useState(0);

  const visible =
    recording !== null &&
    (phase === "recording" || phase === "stopping") &&
    pathname !== `/chat/${recording.roomId}`;

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [visible]);

  if (!visible || !recording) return null;

  return (
    <button
      type="button"
      className={`${styles.pill} ${uploadHealth === "failed" ? styles.warn : ""}`}
      onClick={() => router.push(`/chat/${recording.roomId}`)}
      title="녹음 중인 방으로 이동"
    >
      <span className={styles.dot} aria-hidden />
      <span className={styles.name}>{recording.roomName}</span>
      <span className={styles.time}>
        {formatElapsed(Date.now() - recording.startedAtMs)}
      </span>
    </button>
  );
}
