import { Router } from "express";
import type { Repositories } from "../repositories/types";
import { sessionStore } from "../auth/session";
import { config } from "../config";
import { requireAuth } from "../auth/middleware";
import { extractToken, SESSION_COOKIE } from "../auth/token";

export function createAuthRouter(repos: Repositories): Router {
  const router = Router();

  router.post("/login", async (req, res) => {
    const { id, email, password } = req.body ?? {};
    const lookup = (typeof email === "string" && email) || (typeof id === "string" && id) || "";
    if (!lookup || typeof password !== "string") {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    const user = lookup.includes("@")
      ? await repos.users.findByEmail(lookup)
      : await repos.users.findById(lookup);
    if (!user) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }
    if (password !== config.defaultPassword) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }
    const session = sessionStore.issue(user.id);
    res.json({ ok: true, token: session.token, user });
  });

  router.post("/logout", (req, res) => {
    const token = extractToken(req);
    if (token) sessionStore.revoke(token);
    // Hint the browser to drop the cookie. The frontend also clears it locally
    // so client-side `fetch` stops sending the revoked token immediately.
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
    );
    res.json({ ok: true });
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json(req.currentUser);
  });

  return router;
}
