import { Router } from "express";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import type { Pool } from "pg";
import { requireRole } from "../auth/middleware";
import { realtime } from "../realtime";

// Phase 8 K-6 — 서비스 상태 / 버전.
export interface SystemDeps {
  mode: "memory" | "postgres";
  pool?: Pool;
}

// Version + git commit are fixed for the process lifetime — resolve once.
function readVersion(): string {
  if (process.env.npm_package_version) return process.env.npm_package_version;
  for (const candidate of [
    path.join(process.cwd(), "package.json"),
    path.join(process.cwd(), "..", "package.json")
  ]) {
    try {
      const pkg = JSON.parse(fs.readFileSync(candidate, "utf8")) as {
        version?: string;
      };
      if (typeof pkg.version === "string") return pkg.version;
    } catch {
      /* try next candidate */
    }
  }
  return "0.0.0";
}

function readGitCommit(): string {
  try {
    return (
      execSync("git rev-parse --short HEAD", {
        stdio: ["ignore", "pipe", "ignore"]
      })
        .toString()
        .trim() || "unknown"
    );
  } catch {
    return "unknown";
  }
}

const VERSION = readVersion();
const GIT_COMMIT = readGitCommit();

export function createSystemRouter(deps: SystemDeps): Router {
  const router = Router();
  const admins = requireRole("admin", "super_admin");

  router.get("/health", admins, async (_req, res) => {
    let database: {
      ok: boolean;
      pool?: { total: number; idle: number; waiting: number };
    };
    if (deps.mode === "postgres" && deps.pool) {
      try {
        await deps.pool.query("SELECT 1");
        database = {
          ok: true,
          pool: {
            total: deps.pool.totalCount,
            idle: deps.pool.idleCount,
            waiting: deps.pool.waitingCount
          }
        };
      } catch {
        database = { ok: false };
      }
    } else {
      // Memory adapter has no external dependency to probe.
      database = { ok: true };
    }

    res.json({
      status: database.ok ? "ok" : "degraded",
      adapter: deps.mode,
      uptimeSeconds: Math.floor(process.uptime()),
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      socketClients: realtime.clientCount(),
      database,
      timestamp: new Date().toISOString()
    });
  });

  router.get("/version", admins, (_req, res) => {
    res.json({
      version: VERSION,
      gitCommit: GIT_COMMIT,
      node: process.version,
      env: process.env.NODE_ENV ?? "development"
    });
  });

  return router;
}
