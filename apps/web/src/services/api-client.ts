const DEFAULT_BASE = "http://localhost:4000/api/v1";

function resolveBaseUrl(): string {
  if (typeof process === "undefined") return DEFAULT_BASE;
  const publicUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const internalUrl = process.env.API_BASE_URL?.trim();
  // 서버 사이드(웹 컨테이너의 SSR)는 컨테이너 네트워크로 API 에 직접 도달할
  // 수 있다 — API_BASE_URL 이 있으면 우선 사용해 리버스 프록시 hairpin 과
  // (폐쇄망) 자체 CA 인증서 검증을 피한다. 브라우저는 빌드 시 인라인된
  // 공개 URL(NEXT_PUBLIC_API_BASE_URL)을 사용한다. 둘 다 없으면 dev 기본값.
  const isServer = typeof window === "undefined";
  if (isServer && internalUrl) return internalUrl.replace(/\/$/, "");
  if (publicUrl) return publicUrl.replace(/\/$/, "");
  if (internalUrl) return internalUrl.replace(/\/$/, "");
  return DEFAULT_BASE;
}

export const apiBaseUrl = resolveBaseUrl();

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  token?: string;
  expectStatus?: number[];
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function buildUrl(path: string, query?: ApiRequestOptions["query"]): string {
  const base = apiBaseUrl.replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!query) return `${base}${normalized}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${base}${normalized}?${qs}` : `${base}${normalized}`;
}

// Phase 1 D-3 — single-flight refresh promise. When multiple in-flight
// requests get 401 at the same time we want exactly one /auth/refresh
// round trip; subsequent callers await the same promise. This avoids a
// thundering-herd of refresh attempts (and the refresh-rotation that
// would render all-but-one of them invalid).
let inflightRefresh: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = (async () => {
    try {
      const res = await fetch(buildUrl("/auth/refresh"), {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      // Clear immediately after settling so the next round of 401s
      // triggers a fresh refresh attempt rather than reusing this resolved
      // promise indefinitely.
      inflightRefresh = null;
    }
  })();
  return inflightRefresh;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return apiRequestInternal<T>(path, options, false);
}

async function apiRequestInternal<T>(
  path: string,
  options: ApiRequestOptions,
  didRetry: boolean
): Promise<T> {
  const { body, query, token, headers, expectStatus, credentials, ...rest } = options;
  const url = buildUrl(path, query);
  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(headers as Record<string, string> | undefined)
  };

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      cache: rest.cache ?? "no-store",
      credentials: credentials ?? "include",
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    throw new ApiError(0, `Network error while requesting ${path}`, error);
  }

  // 401 auto-refresh: attempt exactly once per call. Skip when the failing
  // request IS the refresh endpoint (otherwise we recurse forever) or when
  // an explicit Authorization-header token was passed (bearer flow opts
  // out of the cookie/refresh dance).
  if (
    response.status === 401 &&
    !didRetry &&
    !token &&
    typeof window !== "undefined" &&
    !path.startsWith("/auth/refresh") &&
    !path.startsWith("/auth/login")
  ) {
    const ok = await attemptRefresh();
    if (ok) {
      return apiRequestInternal<T>(path, options, true);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json().catch(() => undefined) : await response.text();

  const allowed = expectStatus ?? [200, 201];
  if (!response.ok && !allowed.includes(response.status)) {
    const message =
      (payload && typeof payload === "object" && "error" in (payload as Record<string, unknown>)
        ? String((payload as Record<string, unknown>).error)
        : undefined) ?? `Request to ${path} failed (${response.status})`;
    throw new ApiError(response.status, message, payload);
  }

  return payload as T;
}

// Returns undefined ONLY on 404. Auth failures (401/403) still throw so that
// callers can distinguish "missing resource" from "missing/expired session".
export async function apiRequestOrNull<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T | undefined> {
  try {
    return await apiRequest<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
}

// Auth-aware helper: swallows 401/403 in addition to 404. Use this only for
// "am I logged in?" probes, never for resource lookups.
export async function apiRequestAuthOrNull<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T | undefined> {
  try {
    return await apiRequest<T>(path, options);
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.status === 401 || error.status === 403)
    ) {
      return undefined;
    }
    throw error;
  }
}
