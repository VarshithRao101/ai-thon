/**
 * Where the Hive workers run (D-047).
 * - "inprocess" (laptop default): long-lived workers start with the Next.js server.
 * - "serverless" (default on Vercel): no background process; each trigger drains
 *   the queue after its response, and /api/hive/tick covers delayed work.
 */
export function hiveMode(): "inprocess" | "serverless" {
  const mode = process.env.HIVE_MODE;
  if (mode === "serverless" || mode === "inprocess") {
    return mode;
  }
  return process.env.VERCEL === "1" ? "serverless" : "inprocess";
}

export function isServerlessHive(): boolean {
  return hiveMode() === "serverless";
}

/** postgres.js pool options: small pools and short idle times on serverless. */
export function poolOptions(defaultMax: number): {
  max: number;
  idle_timeout?: number;
  max_lifetime?: number;
} {
  if (!isServerlessHive()) {
    return { max: defaultMax };
  }
  const max = Number(process.env.DB_POOL_MAX ?? Math.min(defaultMax, 4));
  return { max, idle_timeout: 20, max_lifetime: 60 * 10 };
}
