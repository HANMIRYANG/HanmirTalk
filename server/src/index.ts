// MUST be the very first import. Side-effect module that loads .env into
// process.env before ANY other module evaluates — notably ./config which
// reads process.env at module-load time. See ./load-env for the multi-path
// dotenv setup (npm workspace cwd may be root OR server/).
import "./load-env";

import { createServer } from "http";
import { Pool } from "pg";
import { createApp } from "./app";
import { config } from "./config";
import { verifyMailer } from "./mailer";
import { realtime } from "./realtime";
import { createMemoryRepositories } from "./repositories/memory";
import { createPostgresRepositories } from "./repositories/postgres";
import type { Repositories } from "./repositories/types";
import { notifyTaskDueSoonForAll } from "./notify";
import { startScheduledMessagePoller } from "./scheduled-poller";
import { scheduleAudioCleanupCron, startMeetingWorker } from "./meetings/worker";

function buildRepositories(): {
  repos: Repositories;
  mode: "memory" | "postgres";
  pool?: Pool;
} {
  if (!config.databaseUrl) {
    return { repos: createMemoryRepositories(), mode: "memory" };
  }
  const pool = new Pool({ connectionString: config.databaseUrl });
  pool.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[hanmir-server] postgres pool error:", err.message);
  });
  return { repos: createPostgresRepositories(pool), mode: "postgres", pool };
}

const { repos, mode, pool } = buildRepositories();
const app = createApp({ repos, system: { mode, pool } });

// Plain http server so socket.io can attach alongside Express.
const httpServer = createServer(app);
realtime.attach(httpServer, repos);

httpServer.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[hanmir-server] repository adapter: ${mode}`);
  // eslint-disable-next-line no-console
  console.log(`[hanmir-server] listening on http://localhost:${config.port}${config.apiPrefix}`);
  void verifyMailer();
  scheduleDueSoonCron(repos);
  // Phase 10 M-4 — 예약 메시지 poller. boot 직후 10초 지연 후 첫 tick,
  // 이후 60초 주기. 단일 인스턴스라 충돌 가드는 markSent("sent_at IS NULL").
  startScheduledMessagePoller(repos);
  // 회의 녹음 → AI 회의록 파이프라인 워커 (10초 폴링) + 오디오 보존기한
  // 일일 정리 (KST 04:00).
  startMeetingWorker(repos);
  scheduleAudioCleanupCron(repos);
});

// Phase 6 I-2 — 마감 임박 알림 일일 스케줄러. 단일 VM 전제(N-0 결정)라
// 외부 cron 도입 없이 in-process recursive setTimeout 으로 KST 09:00 1회
// 발사. setInterval 대신 매 발사마다 다음 09:00 까지의 거리를 새로 계산해
// 시스템 시계 drift / suspend 영향을 보정한다.
//
// 부팅 시점이 09:00 이후면 다음 날 09:00 까지 대기 — 부팅 직후 즉시 발사
// 하지 않는다 (이미 같은 날 발사된 경우 in-memory dedup Set 만으로는
// 다른 process 인스턴스 알림과 충돌 방지가 안 되므로 안전 우선).
function msUntilNextKstNineAm(now: Date = new Date()): number {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const nowKstMs = now.getTime() + KST_OFFSET_MS;
  const nowKst = new Date(nowKstMs);
  // KST 자정(UTC 자정 + 9h) 기준으로 09:00 마크 계산.
  const todayKst9 = Date.UTC(
    nowKst.getUTCFullYear(),
    nowKst.getUTCMonth(),
    nowKst.getUTCDate(),
    9,
    0,
    0,
    0
  ) - KST_OFFSET_MS;
  if (todayKst9 > now.getTime()) return todayKst9 - now.getTime();
  // 오늘 09:00 KST 가 이미 지났으면 내일 09:00 KST.
  return todayKst9 + 24 * 60 * 60 * 1000 - now.getTime();
}

function scheduleDueSoonCron(repos: Repositories): void {
  const wait = msUntilNextKstNineAm();
  const nextFire = new Date(Date.now() + wait);
  // eslint-disable-next-line no-console
  console.log(
    `[hanmir-server] task due-soon cron: next fire at ${nextFire.toISOString()} (in ${Math.round(
      wait / 1000 / 60
    )} min)`
  );
  setTimeout(() => {
    void notifyTaskDueSoonForAll(repos);
    // 발사 직후 다음 09:00 KST 재계산. recursive setTimeout 패턴.
    scheduleDueSoonCron(repos);
  }, wait).unref();
}
