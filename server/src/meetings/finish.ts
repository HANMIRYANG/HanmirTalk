// 녹음 종료 공통 경로 — 수동 종료(라우트), 최대시간 자동 종료(청크 핸들러),
// 좀비 녹음 auto-finish(워커) 가 공유한다. audit 은 요청 컨텍스트가 있는
// 라우트 쪽 책임.
import type { Meeting } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { config } from "../config";
import { realtime } from "../realtime";
import { postMeetingSystemMessage } from "./post";

// recording → pending 전이 + 종료 안내. 빈 녹음(0바이트)은 파이프라인에
// 태우지 않고 즉시 failed 로 종결한다. 이미 종료된 회의면 undefined (멱등).
export async function finalizeRecording(
  repos: Repositories,
  meeting: Meeting,
  systemMessage: string
): Promise<Meeting | undefined> {
  const now = new Date();
  const retentionUntil = new Date(
    now.getTime() + config.audioRetentionDays * 24 * 60 * 60 * 1000
  );
  const finished = await repos.meetings.finish(meeting.id, now, retentionUntil);
  if (!finished) return undefined;

  const segments = await repos.meetings.listSegments(meeting.id);
  const totalBytes = segments.reduce((sum, s) => sum + s.bytes, 0);
  if (totalBytes === 0) {
    await repos.meetings.markFailed(meeting.id, "empty_recording");
    if (meeting.roomId) {
      await postMeetingSystemMessage(
        repos,
        meeting.roomId,
        meeting.startedBy,
        "회의 녹음에 오디오가 기록되지 않아 회의록을 만들 수 없습니다."
      );
    }
    realtime.emitMeetingUpdated({
      id: meeting.id,
      roomId: meeting.roomId,
      startedBy: meeting.startedBy,
      status: "failed",
      error: "empty_recording"
    });
  } else {
    if (meeting.roomId) {
      await postMeetingSystemMessage(
        repos,
        meeting.roomId,
        meeting.startedBy,
        systemMessage
      );
    }
    realtime.emitMeetingUpdated({
      id: meeting.id,
      roomId: meeting.roomId,
      startedBy: meeting.startedBy,
      status: "pending"
    });
  }
  return repos.meetings.findById(meeting.id);
}
