/**
 * Next.js server startup hook. Reports whether Postgres row-level security
 * actually applies to the app's database role (see lib/db/rls-status.ts).
 * Set REQUIRE_RLS=true (production) to refuse to start without it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
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
