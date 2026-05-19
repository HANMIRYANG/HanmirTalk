import { Router } from "express";
import type { MentionSearchResult, MentionSearchScope } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";

// Phase 5 H-1 — unified search for the @ popover. Returns results from
// multiple domains (users, departments, projects, tasks, files) filtered
// to what the caller can reference. Composer queries this on every
// keystroke after `@`, so we keep the response small (limit 20).
//
// scope: optional. If omitted, only the user directory is searched —
// the most common @mention case and the cheapest query. When the user
// types `@#` they can use scope=project/task/file to widen.
//
// Each result is a MentionSearchResult { type, id, label, sublabel?,
// initials?, avatarTone? }. Type drives the eventual entity type that
// the client writes into the message body on selection.

const VALID_SCOPES: MentionSearchScope[] = [
  "user",
  "department",
  "project",
  "task",
  "file"
];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export function createMentionsRouter(repos: Repositories): Router {
  const router = Router();

  router.get("/search", async (req, res) => {
    const me = req.currentUser!;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 1) {
      // No query → no suggestions. The composer should debounce calls
      // until at least one character is typed.
      res.json({ results: [] });
      return;
    }
    const scopeParam = typeof req.query.scope === "string" ? req.query.scope : "user";
    const scopes: MentionSearchScope[] = scopeParam
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is MentionSearchScope =>
        (VALID_SCOPES as readonly string[]).includes(s)
      );
    if (scopes.length === 0) {
      res.json({ results: [] });
      return;
    }
    const limit = Math.min(
      Math.max(Number(req.query.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1),
      MAX_LIMIT
    );

    const isAdmin = me.role === "admin" || me.role === "super_admin";
    const needle = q.toLowerCase();
    const results: MentionSearchResult[] = [];

    if (scopes.includes("user")) {
      const users = await repos.users.list();
      for (const u of users) {
        if (results.length >= limit) break;
        if (u.isActive === false) continue;
        if (u.id === me.id) continue;
        const hay = `${u.name} ${u.email} ${u.departmentName} ${u.position}`.toLowerCase();
        if (!hay.includes(needle)) continue;
        results.push({
          type: "user",
          id: u.id,
          label: u.name,
          sublabel: `${u.departmentName} · ${u.position}`,
          initials: u.initials,
          avatarTone: u.avatarTone
        });
      }
    }

    if (scopes.includes("department") && results.length < limit) {
      const departments = await repos.departments.list();
      for (const d of departments) {
        if (results.length >= limit) break;
        if (!d.name.toLowerCase().includes(needle)) continue;
        results.push({
          type: "department",
          id: d.id,
          label: d.name,
          sublabel: d.description?.slice(0, 40)
        });
      }
    }

    // Project / task / file scopes are membership-restricted. We pull
    // once and filter; the lists are small for an intranet app.
    let accessibleProjectIds: Set<string> | undefined;
    const getAccessibleProjectIds = async (): Promise<Set<string>> => {
      if (accessibleProjectIds) return accessibleProjectIds;
      const projects = await repos.projects.list();
      accessibleProjectIds = new Set(
        isAdmin
          ? projects.map((p) => p.id)
          : projects.filter((p) => p.memberIds.includes(me.id)).map((p) => p.id)
      );
      return accessibleProjectIds;
    };

    if (scopes.includes("project") && results.length < limit) {
      const allowed = await getAccessibleProjectIds();
      const projects = await repos.projects.list();
      for (const p of projects) {
        if (results.length >= limit) break;
        if (!allowed.has(p.id)) continue;
        const hay = `${p.code} ${p.name} ${p.fullName ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) continue;
        results.push({
          type: "project",
          id: p.id,
          label: `${p.code} ${p.name}`,
          sublabel: p.department || p.stageLabel || undefined
        });
      }
    }

    if (scopes.includes("task") && results.length < limit) {
      const allowed = await getAccessibleProjectIds();
      const tasks = await repos.tasks.list();
      for (const t of tasks) {
        if (results.length >= limit) break;
        if (!allowed.has(t.projectId)) continue;
        const hay = `${t.code} ${t.title}`.toLowerCase();
        if (!hay.includes(needle)) continue;
        results.push({
          type: "task",
          id: t.id,
          label: t.title,
          sublabel: `${t.code} · ${t.dueLabel ?? ""}`
        });
      }
    }

    if (scopes.includes("file") && results.length < limit) {
      const allowed = await getAccessibleProjectIds();
      const files = await repos.files.listFiles();
      for (const f of files) {
        if (results.length >= limit) break;
        // Visible if: uploaded by self, OR linked to an accessible
        // project / task. Files not tied to anything (scope=공유) are
        // visible to everyone since they're already public in the
        // file library.
        const accessible =
          f.uploaderId === me.id ||
          isAdmin ||
          (f.projectId && allowed.has(f.projectId)) ||
          (!f.projectId && !f.productId && !f.taskId);
        if (!accessible) continue;
        if (!f.name.toLowerCase().includes(needle)) continue;
        results.push({
          type: "file",
          id: f.id,
          label: f.name,
          sublabel: f.scope
        });
      }
    }

    res.json({ results });
  });

  return router;
}
