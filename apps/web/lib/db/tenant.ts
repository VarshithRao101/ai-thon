import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import { db } from "./index";
import type { WorkspaceRole } from "./schema";

/**
 * Who is acting, and in which workspace. Set once per request (or per workflow
 * run) and carried through every async call via AsyncLocalStorage, so deep
 * code such as step logging and credential fetching never needs it passed in.
 */
export type TenantContext = {
  workspaceId: string;
  userId?: string;
  role?: WorkspaceRole;
  /** HMAC of the client IP (never the raw IP), for the audit log. */
  ipHash?: string;
  userAgent?: string;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const storage = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(context: TenantContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentTenant(): TenantContext | undefined {
  return storage.getStore();
}

export function requireTenant(): TenantContext {
  const context = storage.getStore();
  if (!context) {
    throw new Error(
      "No tenant context: wrap the caller in runWithTenant() (route helper or dispatch)"
    );
  }
  return context;
}

/**
 * Run `fn` in a transaction scoped to the current workspace. Postgres
 * row-level security (drizzle/0006) then limits every statement to that
 * workspace's rows, even if a query forgets its own workspace filter.
 */
export function tdb<T>(
  fn: (tx: Tx) => Promise<T>,
  context: TenantContext = requireTenant()
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.workspace_id', ${context.workspaceId}, true)`
    );
    return fn(tx);
  });
}

/**
 * Run `fn` with no tenant context. RLS then exposes only rows that are public
 * by policy (e.g. public workflows). Use for unauthenticated pages.
 */
export function publicDb<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.workspace_id', '', true)`);
    return fn(tx);
  });
}
