// Monkey-patches Express 4 so async route handlers route rejections through
// the central error middleware below. Must be imported before the routers.
import "express-async-errors";

import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { config } from "./config";
import { createMemoryRepositories } from "./repositories/memory";
import type { Repositories } from "./repositories/types";
import { attachCurrentUser, requireAuth } from "./auth/middleware";
import { createAuthRouter } from "./routes/auth";
import { createUsersRouter } from "./routes/users";
import { createRoomsRouter } from "./routes/rooms";
import { createMessagesRouter } from "./routes/messages";
import { createMentionsRouter } from "./routes/mentions";
import { createDecisionsRouter, createProjectDecisionsRouter } from "./routes/decisions";
import { createAiRouter } from "./routes/ai";
import {
  createNotificationsRouter,
  createNotificationSettingsRouter
} from "./routes/notifications";
import { createPushSubscriptionsRouter } from "./routes/push-subscriptions";
import { createProjectsRouter } from "./routes/projects";
import { createTasksRouter } from "./routes/tasks";
import { createProductsRouter } from "./routes/products";
import { createErpRouter } from "./routes/erp";
import { createFilesRouter } from "./routes/files";
import { createNoticesRouter } from "./routes/notices";
import { createDepartmentsRouter } from "./routes/departments";
import { createDashboardRouter } from "./routes/dashboard";
import { createInvitationsRouter } from "./routes/invitations";
import { createAuditRouter } from "./routes/audit";
import { createSystemRouter, type SystemDeps } from "./routes/system";
import { createOrgNotificationsRouter } from "./routes/org-notifications";
import { createSearchRouter } from "./routes/search";
import { createMeetingsRouter } from "./routes/meetings";

export interface AppDeps {
  repos: Repositories;
  // Phase 8 K-6 — adapter mode + pg pool for the /system status endpoints.
  // Omitted in tests / default boot → treated as the memory adapter.
  system?: SystemDeps;
}

export function createApp(deps: AppDeps = { repos: createMemoryRepositories() }): Express {
  const app = express();
  app.use(
    cors({
      origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",").map((s) => s.trim()),
      credentials: true
    })
  );
  app.use(express.json({ limit: "5mb" }));
  app.use(attachCurrentUser(deps.repos));

  app.get(`${config.apiPrefix}/health`, (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  // Auth router stays public (login + logout); `/auth/me` is guarded inside the router.
  app.use(`${config.apiPrefix}/auth`, createAuthRouter(deps.repos));

  // Everything else requires a valid session.
  app.use(`${config.apiPrefix}/users`, requireAuth, createUsersRouter(deps.repos));
  app.use(`${config.apiPrefix}/departments`, requireAuth, createDepartmentsRouter(deps.repos));
  app.use(`${config.apiPrefix}/rooms`, requireAuth, createRoomsRouter(deps.repos));
  app.use(`${config.apiPrefix}/messages`, requireAuth, createMessagesRouter(deps.repos));
  app.use(`${config.apiPrefix}/mentions`, requireAuth, createMentionsRouter(deps.repos));
  app.use(`${config.apiPrefix}/projects`, requireAuth, createProjectsRouter(deps.repos));
  // Phase 3 F-1 — project-scoped decisions (list + create) live under
  // /projects/:projectId/decisions. Per-id ops mount separately below.
  app.use(
    `${config.apiPrefix}/projects/:projectId/decisions`,
    requireAuth,
    createProjectDecisionsRouter(deps.repos)
  );
  app.use(`${config.apiPrefix}/decisions`, requireAuth, createDecisionsRouter(deps.repos));
  app.use(`${config.apiPrefix}/ai`, requireAuth, createAiRouter(deps.repos));
  app.use(`${config.apiPrefix}/tasks`, requireAuth, createTasksRouter(deps.repos));
  app.use(`${config.apiPrefix}/products`, requireAuth, createProductsRouter(deps.repos));
  app.use(`${config.apiPrefix}/erp`, requireAuth, createErpRouter(deps.repos));
  app.use(`${config.apiPrefix}/files`, requireAuth, createFilesRouter(deps.repos));
  app.use(`${config.apiPrefix}/meetings`, requireAuth, createMeetingsRouter(deps.repos));
  app.use(`${config.apiPrefix}/notices`, requireAuth, createNoticesRouter(deps.repos));
  app.use(`${config.apiPrefix}/dashboard`, requireAuth, createDashboardRouter(deps.repos));
  app.use(`${config.apiPrefix}/invitations`, requireAuth, createInvitationsRouter(deps.repos));
  app.use(`${config.apiPrefix}/audit`, requireAuth, createAuditRouter(deps.repos));
  app.use(`${config.apiPrefix}/search`, requireAuth, createSearchRouter(deps.repos));
  app.use(
    `${config.apiPrefix}/org-notification-defaults`,
    requireAuth,
    createOrgNotificationsRouter(deps.repos)
  );
  app.use(
    `${config.apiPrefix}/system`,
    requireAuth,
    createSystemRouter(deps.system ?? { mode: "memory" })
  );
  app.use(`${config.apiPrefix}/notifications`, requireAuth, createNotificationsRouter(deps.repos));
  app.use(
    `${config.apiPrefix}/notification-settings`,
    requireAuth,
    createNotificationSettingsRouter(deps.repos)
  );
  app.use(
    `${config.apiPrefix}/push-subscriptions`,
    requireAuth,
    createPushSubscriptionsRouter(deps.repos)
  );

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  // Central error handler. Anything thrown (sync or async) from a route or
  // middleware lands here and is logged server-side. We never echo the raw
  // error message to clients — failure modes are intentionally opaque to keep
  // schema/SQL details out of public responses.
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error("[hanmir-server] unhandled error:", err);
    } else {
      // Production: log only the name/message, not the full stack.
      const name = err instanceof Error ? err.name : "Error";
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(`[hanmir-server] ${name}: ${message}`);
    }
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
