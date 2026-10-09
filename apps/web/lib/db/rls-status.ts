import { sql } from "drizzle-orm";
import { db } from "./index";

export type RlsStatus =
  | { enforced: true; role: string }
  | { enforced: false; role: string; reason: string };

/**
 * Postgres skips row-level security for superusers, roles with BYPASSRLS and
 * table owners. Check which one the app is connected as, so a misconfigured
 * DATABASE_URL is visible instead of silently disabling tenant isolation.
 */
export async function getRlsStatus(): Promise<RlsStatus> {
  const rows = (await db.execute(sql`
    select current_user as role, r.rolsuper as superuser, r.rolbypassrls as bypass,
      (select tableowner from pg_tables where schemaname = 'public' and tablename = 'workflows') as owner
    from pg_roles r where r.rolname = current_user`)) as unknown as {
    role: string;
    superuser: boolean;
    bypass: boolean;
    owner: string | null;
  }[];
  const row = rows[0];
  if (!row) {
    return {
      enforced: false,
      role: "unknown",
      reason: "could not read pg_roles",
    };
  }
  if (row.superuser) {
    return {
      enforced: false,
      role: row.role,
      reason: "connected as a superuser",
    };
  }
  if (row.bypass) {
    return { enforced: false, role: row.role, reason: "role has BYPASSRLS" };
  }
  if (row.owner === row.role) {
    return {
      enforced: false,
      role: row.role,
      reason: "connected as the table owner",
    };
  }
  return { enforced: true, role: row.role };
}
