import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { drainHive } from "@/lib/hive/drain";
import { markTicked } from "@/lib/hive/opportunistic";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BEARER = /^bearer\s+/i;
const QUOTES = /^["']|["']$/g;

/**
 * The secret from `Authorization: Bearer <secret>` (any case, optional quotes
 * or spaces, or the bare secret), or from an `x-cron-secret` header: cron
 * services differ in how they let you set headers.
 */
function presentedSecret(request: Request): string {
  const raw =
    request.headers.get("authorization") ??
    request.headers.get("x-cron-secret") ??
    // ?key=… for cron services where headers are awkward to set.
    new URL(request.url).searchParams.get("key") ??
    "";
  return raw.trim().replace(QUOTES, "").trim().replace(BEARER, "").trim();
}

// GET /api/hive/tick: the serverless Hive heartbeat (D-047). cron-job.org calls
// it every minute with `Authorization: Bearer $CRON_SECRET` (or `?key=`); the
// app also ticks itself while people use it (lib/hive/opportunistic.ts). It answers at once,
// then picks up retries, durable delays and schedule ticks, runs pg-boss
// maintenance.
export function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Tick is not configured" },
      { status: 503 }
    );
  }
  const given = Buffer.from(presentedSecret(request));
  const expected = Buffer.from(secret.trim());
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  markTicked();
  after(() =>
    drainHive({
      supervise: true,
      minMs: 8000,
      idleMs: 3000,
      budgetMs: 90_000,
    }).catch((error: unknown) => console.error("[hive] tick failed:", error))
  );
  return NextResponse.json(
    { ok: true, at: new Date().toISOString() },
    { status: 202 }
  );
}
