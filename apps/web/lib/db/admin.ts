import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { poolOptions } from "../hive/mode";

/**
 * Owner connection for system jobs that span workspaces (the anchorer batches
 * receipts from every tenant). Never use it for request handling: it bypasses
 * row-level security by design.
 */
const globalForAdmin = globalThis as unknown as {
  adminDb?: PostgresJsDatabase;
};

export function adminDb(): PostgresJsDatabase {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) {
    throw new Error(
      "DATABASE_ADMIN_URL is required for system jobs (anchorer)"
    );
  }
  globalForAdmin.adminDb ??= drizzle(
    postgres(url, { ...poolOptions(2), onnotice: () => undefined })
  );
  return globalForAdmin.adminDb;
}
