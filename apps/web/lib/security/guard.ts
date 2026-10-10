/**
 * Request guards for every signed-in API route (D-056).
 *
 * - Same-origin check for state-changing requests: a browser always sends
 *   Origin on cross-site POST/PUT/DELETE, so a page on another site can't
 *   act with someone's ZETA session (CSRF). Requests without Origin (servers,
 *   scripts, our tests) are not browser-driven and pass.
 * - Body size cap: no multi-megabyte JSON to exhaust memory.
 * - Per-user rate limit per route scope (sliding window, in memory per
 *   instance): bursts are refused with 429 instead of hammering AI or SMTP.
 */
const MAX_BODY_BYTES = 1_000_000;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Requests per minute per user for sensitive scopes; others share a default.
const LIMITS: Record<string, number> = {
  "ai.generate": 12,
  "ai.doctor": 12,
  "integrations.try": 10,
  "integrations.test": 20,
  "integrations.telegram.chats": 20,
  "integrations.create": 20,
  "integrations.update": 20,
  "workflows.create": 30,
  "workflows.duplicate": 30,
  "demo-login": 5,
};
const DEFAULT_LIMIT = 240;
const WINDOW_MS = 60_000;

const globalForGuard = globalThis as unknown as {
  zetaHits?: Map<string, number[]>;
};

export type GuardFailure = { status: number; message: string } | null;

function allowedOrigins(): Set<string> {
  const list = [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.PUBLIC_APP_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ];
  const out = new Set<string>();
  for (const value of list) {
    if (value) {
      try {
        out.add(new URL(value).origin);
      } catch {
        // ignore malformed
      }
    }
  }
  return out;
}

export function checkOrigin(request: Request): GuardFailure {
  if (SAFE_METHODS.has(request.method)) {
    return null;
  }
  const origin = request.headers.get("origin");
  if (!origin) {
    return null;
  }
  const self = new URL(request.url).origin;
  if (origin === self || allowedOrigins().has(origin)) {
    return null;
  }
  return { status: 403, message: "Cross-site request blocked" };
}

export function checkBodySize(request: Request): GuardFailure {
  const length = Number(request.headers.get("content-length") ?? 0);
  return length > MAX_BODY_BYTES
    ? { status: 413, message: "Request too large" }
    : null;
}

export function checkRate(key: string, scope: string): GuardFailure {
  globalForGuard.zetaHits ??= new Map();
  const hits = globalForGuard.zetaHits;
  const now = Date.now();
  if (hits.size > 20_000) {
    for (const [k, v] of hits) {
      if ((v.at(-1) ?? 0) < now - WINDOW_MS) {
        hits.delete(k);
      }
    }
  }
  const limit = LIMITS[scope] ?? DEFAULT_LIMIT;
  const id = `${key}:${scope}`;
  const recent = (hits.get(id) ?? []).filter((t) => t > now - WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(id, recent);
    return {
      status: 429,
      message: "Too many requests. Wait a minute and try again.",
    };
  }
  recent.push(now);
  hits.set(id, recent);
  return null;
}
