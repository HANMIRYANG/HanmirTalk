// 회의 파이프라인 워커 — scheduled-poller.ts 와 동일한 in-process recursive
// setTimeout 패턴 (단일 VM N-0 전제, 외부 큐 미도입 결정). 10초 tick 마다:
//   1) 좀비 녹음(30분 무활동) auto-finish
//   1.5) awaiting_ppt 대기시간 초과 회의 → PPT 없이 자동 진행
//   2) meetings.status 기반 클레임 1건 → 파이프라인 실행
// stage 별 3회 재시도: advance() 가 attempts 를 리셋하고, claimNext 가
// attempts+1 하므로 attempts > 3 이면 해당 stage 가 3회 실패한 것.
// 서버 재시작 복구: claimed_at 이 15분 지난 클레임은 재획득된다.
import type { Repositories } from "../repositories/types";
import { config } from "../config";
import { realtime } from "../realtime";
import { runMeetingPipeline } from "./pipeline";
import { finalizeRecording } from "./finish";
import { postMeetingSystemMessage } from "./post";
import { deleteMeetingAudio } from "./storage";

const POLL_INTERVAL_MS = 10 * 1000;
const CLAIM_STALE_MS = 15 * 60 * 1000;
const RECORDING_STALE_MS = 30 * 60 * 1000;
const MAX_STAGE_ATTEMPTS = 3;

let timer: NodeJS.Timeout | null = null;
let running = false;

export async function pollMeetingsOnce(repos: Repositories): Promise<void> {
  if (running) return;
  running = true;
  try {
    const now = Date.now();

    // 1) 좀비 녹음 — 탭 강제 종료/PC 꺼짐으로 청크가 끊긴 recording 을
    //    자동 종료해 파이프라인에 태운다 (재개 프롬프트의 안전망).
    const stale = await repos.meetings.listStaleRecordings(
      new Date(now - RECORDING_STALE_MS)
    );
    for (const meeting of stale) {
      try {
        await finalizeRecording(
          repos,
          meeting,
          "녹음이 30분 이상 이어지지 않아 회의가 자동 종료되었습니다. 회의록 생성 중..."
        );
        // eslint-disable-next-line no-console
        console.log(`[hanmir-server] meeting-worker: auto-finished stale recording ${meeting.id}`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[hanmir-server] meeting-worker stale-finish ${meeting.id} failed:`, err);
      }
    }

    // 1.5) awaiting_ppt 타임아웃 — 대기 시간이 지난 회의는 PPT 없이 진행.
    //      resumeFromPpt 는 상태 가드 전환이라 업로드/건너뛰기와 경합해도
    //      한 쪽만 이긴다. 같은 tick 의 claimNext 가 바로 집어갈 수 있다.
    const pptCutoff = new Date(now - config.meetingPptWaitHours * 60 * 60 * 1000);
    for (const meeting of await repos.meetings.listPptTimedOut(pptCutoff)) {
      try {
        if (!(await repos.meetings.resumeFromPpt(meeting.id))) continue;
        if (meeting.roomId) {
          await postMeetingSystemMessage(
            repos,
            meeting.roomId,
            meeting.startedBy,
            "PPT 업로드 대기 시간이 지나 PPT 없이 회의록 생성을 계속합니다."
          );
        }
        realtime.emitMeetingUpdated({
          id: meeting.id,
          roomId: meeting.roomId,
          startedBy: meeting.startedBy,
          status: "summarizing"
        });
        // eslint-disable-next-line no-console
        console.log(`[hanmir-server] meeting-worker: ppt wait timed out, resuming ${meeting.id}`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[hanmir-server] meeting-worker ppt-timeout ${meeting.id} failed:`, err);
      }
    }

    // 2) 파이프라인 클레임 — tick 당 1건 (회의가 몰려도 순차 처리).
    const claimed = await repos.meetings.claimNext(new Date(now - CLAIM_STALE_MS));
    if (!claimed) return;

    if (claimed.attempts > MAX_STAGE_ATTEMPTS) {
      const error = claimed.error ?? "unknown_error";
      await repos.meetings.markFailed(claimed.id, error);
      if (claimed.roomId) {
        await postMeetingSystemMessage(
          repos,
          claimed.roomId,
          claimed.startedBy,
          `회의록 생성에 실패했습니다: ${claimed.title} — 관리자에게 문의해 주세요.`
        );
      }
      realtime.emitMeetingUpdated({
        id: claimed.id,
        roomId: claimed.roomId,
        startedBy: claimed.startedBy,
        status: "failed",
        error
      });
      // eslint-disable-next-line no-console
      console.error(
        `[hanmir-server] meeting-worker: ${claimed.id} failed permanently at ${claimed.status} (${error})`
      );
      return;
    }

    try {
      await runMeetingPipeline(repos, claimed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(
        `[hanmir-server] meeting-worker step failed (${claimed.id} @ ${claimed.status}, attempt ${claimed.attempts}/${MAX_STAGE_ATTEMPTS}):`,
        msg
      );
      await repos.meetings.releaseClaim(claimed.id, msg);
    }
  } finally {
    running = false;
  }
}

function scheduleNext(repos: Repositories): void {
  timer = setTimeout(() => {
    void pollMeetingsOnce(repos).finally(() => scheduleNext(repos));
  }, POLL_INTERVAL_MS);
  timer.unref();
}

export function startMeetingWorker(repos: Repositories): void {
  if (timer) return;
  timer = setTimeout(() => {
    void pollMeetingsOnce(repos).finally(() => scheduleNext(repos));
  }, 10_000);
  timer.unref();
  // eslint-disable-next-line no-console
  console.log(
    `[hanmir-server] meeting worker: every ${POLL_INTERVAL_MS / 1000}s (first tick in 10s)`
  );
}

export function stopMeetingWorker(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

// ── 오디오 보존기한 정리 (일일, KST 04:00) ─────────────────────────
// index.ts 의 msUntilNextKstNineAm 과 동일한 계산을 시각만 바꿔 복제.
function msUntilNextKstHour(hour: number, now: Date = new Date()): number {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const nowKst = new Date(now.getTime() + KST_OFFSET_MS);
  const todayMark =
    Date.UTC(
      nowKst.getUTCFullYear(),
      nowKst.getUTCMonth(),
      nowKst.getUTCDate(),
      hour,
      0,
      0,
      0
    ) - KST_OFFSET_MS;
  if (todayMark > now.getTime()) return todayMark - now.getTime();
  return todayMark + 24 * 60 * 60 * 1000 - now.getTime();
}

export async function cleanupExpiredAudioOnce(repos: Repositories): Promise<void> {
  const expired = await repos.meetings.listExpiredAudio(new Date());
  for (const meeting of expired) {
    try {
      await deleteMeetingAudio(meeting.id);
      await repos.meetings.clearAudioPath(meeting.id);
      // eslint-disable-next-line no-console
      console.log(`[hanmir-server] meeting audio cleaned: ${meeting.id}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[hanmir-server] meeting audio cleanup ${meeting.id} failed:`, err);
    }
  }
}

export function scheduleAudioCleanupCron(repos: Repositories): void {
  const wait = msUntilNextKstHour(4);
  // eslint-disable-next-line no-console
  console.log(
    `[hanmir-server] meeting audio cleanup cron: next fire in ${Math.round(wait / 1000 / 60)} min`
  );
  setTimeout(() => {
    void cleanupExpiredAudioOnce(repos);
    scheduleAudioCleanupCron(repos);
  }, wait).unref();
}
