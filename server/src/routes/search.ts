import { Router } from "express";
import type { SearchResults } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";

// Phase 9 — 통합 검색. messages는 Phase 2의 FTS/trgm 검색 + 방 멤버십
// 스코프를 재사용하고, files/projects/products/tasks는 이름·설명 substring
// 매칭. 도메인별 상한(PER_DOMAIN)으로 응답 크기를 제한한다.
//
// 제목이 아닌 필드(설명 등)에서 매칭되면 matchedField + snippet 을 함께
// 내려 UI가 매칭 근거를 하이라이트할 수 있게 한다.
const PER_DOMAIN = 20;
const SNIPPET_RADIUS = 40;

function makeSnippet(text: string, needle: string): string {
  const idx = text.toLowerCase().indexOf(needle);
  if (idx === -1) return "";
  const from = Math.max(0, idx - SNIPPET_RADIUS);
  const to = Math.min(text.length, idx + needle.length + SNIPPET_RADIUS);
  return `${from > 0 ? "…" : ""}${text.slice(from, to)}${to < text.length ? "…" : ""}`;
}

export function createSearchRouter(repos: Repositories): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const me = req.currentUser!;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const scope = typeof req.query.scope === "string" ? req.query.scope : "all";

    const results: SearchResults = {
      query: q,
      messages: [],
      files: [],
      projects: [],
      products: [],
      tasks: []
    };
    // 2자 미만은 "전체 나열" 사고를 막기 위해 빈 결과.
    if (q.length < 2) {
      res.json(results);
      return;
    }

    const needle = q.toLowerCase();
    const wants = (domain: string) => scope === "all" || scope === domain;
    const has = (text: string | null | undefined): boolean =>
      typeof text === "string" && text.toLowerCase().includes(needle);
    // 매칭 필드 후보를 순서대로 검사해 첫 매칭의 (필드, 스니펫)을 얹는다.
    // 제목류 필드는 카드 제목에 이미 보이므로 snippet 을 생략한다.
    const match = (
      fields: { field: string; text: string | undefined; titleLike?: boolean }[]
    ): { matchedField: string; snippet?: string } | null => {
      for (const f of fields) {
        if (!has(f.text)) continue;
        return {
          matchedField: f.field,
          ...(f.titleLike ? {} : { snippet: makeSnippet(f.text!, needle) })
        };
      }
      return null;
    };

    if (wants("messages")) {
      // 호출자가 읽을 수 있는 방으로 스코프 (admin은 전체) — /messages/search
      // 와 동일한 D-8 멤버십 정책.
      const rooms = await repos.rooms.list(me.id);
      const isAdmin = me.role === "admin" || me.role === "super_admin";
      const roomIds = isAdmin
        ? rooms.map((r) => r.id)
        : rooms
            .filter((r) => r.members.some((m) => m.userId === me.id))
            .map((r) => r.id);
      if (roomIds.length > 0) {
        results.messages = await repos.messages.search({
          q,
          roomIds,
          limit: PER_DOMAIN
        });
      }
    }

    if (wants("files")) {
      const files = await repos.files.listFiles();
      results.files = files.filter((f) => has(f.name)).slice(0, PER_DOMAIN);
    }

    // projects 목록은 tasks 도메인의 projectName 표시에도 쓰인다.
    const needProjects = wants("projects") || wants("tasks");
    const projects = needProjects ? await repos.projects.list() : [];

    if (wants("projects")) {
      results.projects = projects
        .map((p) => {
          const m = match([
            { field: "name", text: p.name, titleLike: true },
            { field: "code", text: p.code, titleLike: true },
            { field: "description", text: p.description }
          ]);
          return m ? { ...p, ...m } : null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .slice(0, PER_DOMAIN);
    }

    if (wants("products")) {
      const products = await repos.products.list();
      results.products = products
        .map((p) => {
          const m = match([
            { field: "name", text: p.name, titleLike: true },
            { field: "fullName", text: p.fullName, titleLike: true },
            { field: "category", text: p.category, titleLike: true },
            { field: "description", text: p.description }
          ]);
          return m ? { ...p, ...m } : null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .slice(0, PER_DOMAIN);
    }

    if (wants("tasks")) {
      // TaskItem 은 description 을 담지 않으므로 제목·코드만 매칭.
      // 프로젝트 목록 조회와 동일하게 전 사용자 조회 가능 정책.
      const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
      const tasks = await repos.tasks.list();
      results.tasks = tasks
        .map((t) => {
          const m = match([
            { field: "title", text: t.title, titleLike: true },
            { field: "code", text: t.code, titleLike: true }
          ]);
          return m
            ? { ...t, ...m, projectName: projectNameById.get(t.projectId) }
            : null;
        })
        .filter((t): t is NonNullable<typeof t> => t !== null)
        .slice(0, PER_DOMAIN);
    }

    res.json(results);
  });

  return router;
}
