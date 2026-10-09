// Local PostgreSQL 17 without Docker, using embedded-postgres (MIT).
// Data lives in .data/pg (gitignored). Stop with Ctrl+C.
// Usage: pnpm db:local   (port: DEV_DB_PORT, default 5433)
//
// Two roles, mirroring production (docs/10):
//   flowledger      superuser/owner: migrations and system jobs (DATABASE_ADMIN_URL)
//   flowledger_app  least-privilege login for the web app (DATABASE_URL); member of
//                   flowledger_app_role, so Postgres row-level security applies to it
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const dataDir = resolve(import.meta.dirname, "..", ".data", "pg");
const port = Number(process.env.DEV_DB_PORT ?? 5433);
const database = "flowledger";

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "flowledger",
  password: "flowledger", // local-only dev default, never used outside this machine
  port,
  persistent: true,
});

if (!existsSync(resolve(dataDir, "PG_VERSION"))) {
  console.log("[dev-db] initialising a new cluster in .data/pg");
  await pg.initialise();
}
await pg.start();

const admin = pg.getPgClient();
await admin.connect();
const exists = await admin.query("select 1 from pg_database where datname = $1", [database]);
if (exists.rowCount === 0) {
  await pg.createDatabase(database);
  console.log(`[dev-db] created database "${database}"`);
}
// Roles are cluster-wide; idempotent so restarts are safe.
await admin.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flowledger_app_role') THEN
      CREATE ROLE flowledger_app_role NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flowledger_app') THEN
      CREATE ROLE flowledger_app LOGIN PASSWORD 'flowledger_app' NOSUPERUSER NOBYPASSRLS
        IN ROLE flowledger_app_role;
    END IF;
  END
  $$;`);
await admin.end();

console.log(`[dev-db] PostgreSQL ready on :${port} (roles: flowledger = owner, flowledger_app = app)`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  console.log("[dev-db] stopping…");
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
