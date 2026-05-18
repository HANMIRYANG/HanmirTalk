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
realtime.attach(httpServer);

httpServer.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[hanmir-server] repository adapter: ${mode}`);
  // eslint-disable-next-line no-console
  console.log(`[hanmir-server] listening on http://localhost:${config.port}${config.apiPrefix}`);
  void verifyMailer();
});
