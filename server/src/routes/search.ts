import { Router } from "express";
import type { SearchResults } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";

// Phase 9 — 통합 검색. messages는 Phase 2의 FTS/trgm 검색 + 방 멤버십
// 스코프를 재사용하고, files/projects/products는 이름·설명 substring
// 매칭. 도메인별 상한(PER_DOMAIN)으로 응답 크기를 제한한다.
const PER_DOMAIN = 20;

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
      products: []
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

    if (wants("projects")) {
      const projects = await repos.projects.list();
      results.projects = projects
        .filter((p) => has(p.name) || has(p.code) || has(p.description))
        .slice(0, PER_DOMAIN);
    }

    if (wants("products")) {
      const products = await repos.products.list();
      results.products = products
        .filter(
          (p) =>
            has(p.name) ||
            has(p.fullName) ||
            has(p.category) ||
            has(p.description)
        )
        .slice(0, PER_DOMAIN);
    }

    res.json(results);
  });

  return router;
}
