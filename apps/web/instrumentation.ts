/**
 * Next.js server startup hook.
 * 1. Reports whether Postgres row-level security actually applies to the app's
 *    database role (lib/db/rls-status.ts). REQUIRE_RLS=true refuses to start without it.
 * 2. Starts the Hive worker in this process unless HIVE_INPROCESS_WORKER=false
 *    (then run `pnpm --filter @flowledger/web worker` separately).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  await checkRls();
  if (process.env.HIVE_INPROCESS_WORKER !== "false") {
    const { startHiveWorker } = await import("./lib/hive/worker");
    startHiveWorker().catch((error: unknown) => {
      console.error("[hive] worker failed to start:", error);
    });
  }
}

async function checkRls() {
  const { getRlsStatus } = await import("./lib/db/rls-status");
  try {
    const status = await getRlsStatus();
    if (status.enforced) {
      console.info(`[rls] tenant isolation enforced (db role: ${status.role})`);
      return;
    }
    const message = `[rls] WARNING: tenant isolation NOT enforced (db role ${status.role}: ${status.reason}). Point DATABASE_URL at the flowledger_app login role.`;
    if (process.env.REQUIRE_RLS === "true") {
      throw new Error(message);
    }
    console.warn(message);
  } catch (error) {
    if (process.env.REQUIRE_RLS === "true") {
      throw error;
    }
    console.warn("[rls] could not verify row-level security:", error);
  }
}
