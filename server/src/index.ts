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
});
