import type { NextFunction, Request, Response } from "express";
import type { User, UserRole } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { sessionStore } from "./session";
import { extractToken } from "./token";

declare module "express-serve-static-core" {
  interface Request {
    currentUser?: User;
  }
}

export function attachCurrentUser(repos: Repositories) {
  return async function attachCurrentUserMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction
  ) {
    const token = extractToken(req);
    const session = sessionStore.resolve(token);
    if (!session) {
      next();
      return;
    }
    const user = await repos.users.findById(session.userId);
    if (user) req.currentUser = user;
    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

export function requireRole(...allowed: UserRole[]) {
  return function requireRoleMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!req.currentUser) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (!allowed.includes(req.currentUser.role)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}
