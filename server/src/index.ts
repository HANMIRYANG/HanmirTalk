// MUST be the first import — populates process.env from <cwd>/.env before
// any other module reads `process.env.X` (notably ./config). When npm run
// dev / start is invoked from the repo root the .env at the root is picked
// up; running from server/ directly would need a server/.env instead.
// .env.example is the tracked template; .env itself is gitignored.
import "dotenv/config";

import { createServer } from "http";
import { Pool } from "pg";
import { createApp } from "./app";
import { config } from "./config";
import { verifyMailer } from "./mailer";
import { realtime } from "./realtime";
import { createMemoryRepositories } from "./repositories/memory";
import { createPostgresRepositories } from "./repositories/postgres";
import type { Repositories } from "./repositories/types";

function buildRepositories(): { repos: Repositories; mode: "memory" | "postgres" } {
  if (!config.databaseUrl) {
    return { repos: createMemoryRepositories(), mode: "memory" };
  }
  const pool = new Pool({ connectionString: config.databaseUrl });
  pool.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[hanmir-server] postgres pool error:", err.message);
  });
  return { repos: createPostgresRepositories(pool), mode: "postgres" };
}

const { repos, mode } = buildRepositories();
const app = createApp({ repos });

// Plain http server so socket.io can attach alongside Express.
const httpServer = createServer(app);
realtime.attach(httpServer, repos);

httpServer.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[hanmir-server] repository adapter: ${mode}`);
  // eslint-disable-next-line no-console
  console.log(`[hanmir-server] listening on http://localhost:${config.port}${config.apiPrefix}`);
  void verifyMailer();
});
