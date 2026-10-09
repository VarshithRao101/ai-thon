import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../drizzle");

type Journal = { entries: { idx: number; tag: string }[] };

/** Ordered migration tags from drizzle's journal. */
export function migrationTags(): string[] {
  const journal = JSON.parse(
    readFileSync(path.join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8")
  ) as Journal;
  return journal.entries.sort((a, b) => a.idx - b.idx).map((e) => e.tag);
}

/** Apply migration files in order (as the owner), optionally stopping early. */
export async function applyMigrations(
  pg: PGlite,
  options: { from?: number; to?: number } = {}
): Promise<void> {
  const tags = migrationTags();
  const from = options.from ?? 0;
  const to = options.to ?? tags.length - 1;
  for (const tag of tags.slice(from, to + 1)) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, `${tag}.sql`), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) {
        await pg.exec(statement);
      }
    }
  }
}

/** A fresh in-memory Postgres with every migration applied. */
export async function migratedDatabase(): Promise<PGlite> {
  const pg = new PGlite();
  await applyMigrations(pg);
  return pg;
}

/** Run `sql` in a transaction scoped to `workspaceId` (null = no tenant context). */
export function inTenant<T>(
  pg: PGlite,
  workspaceId: string | null,
  sql: string,
  params: unknown[] = []
): Promise<{ rows: T[]; affectedRows?: number }> {
  return pg.transaction(async (tx) => {
    if (workspaceId) {
      await tx.query("select set_config('app.workspace_id', $1, true)", [
        workspaceId,
      ]);
    }
    return tx.query<T>(sql, params);
  });
}
