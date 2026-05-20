import type { SearchResults } from "@hanmir/shared";
import { apiRequest } from "./api-client";

interface AuthOptions {
  token?: string;
}

// Phase 9 — 통합 검색.
export const searchService = {
  async search(
    q: string,
    opts: AuthOptions & { scope?: string } = {}
  ): Promise<SearchResults> {
    const query: Record<string, string> = { q };
    if (opts.scope) query.scope = opts.scope;
    return apiRequest<SearchResults>("/search", { query, token: opts.token });
  }
};
