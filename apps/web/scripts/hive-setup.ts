/**
 * Hive queue setup, run as the database OWNER after the Drizzle migrations
 * (`pnpm db:migrate`). Creates/updates the pg-boss schema and queues, then
 * grants the least-privilege app role (flowledger_app_role) what it needs to
 * enqueue and work jobs. Idempotent.
 */
import { config } from "dotenv";
import { PgBoss } from "pg-boss";
import postgres from "postgres";
import { PGBOSS_SCHEMA, QUEUES, RUNS_QUEUE_OPTIONS } from "../lib/hive/queues";

config({ path: [".env.local", ".env"], quiet: true });

const adminUrl = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
if (!adminUrl) {
  console.error("[hive-setup] DATABASE_ADMIN_URL (or DATABASE_URL) is not set");
  process.exit(1);
}
const connectionString: string = adminUrl;

async function main() {
  const boss = new PgBoss({
    connectionString,
    schema: PGBOSS_SCHEMA,
    application_name: "flowledger-hive-setup",
    supervise: false,
    schedule: false,
    migrate: true,
  });
  boss.on("error", (error) => console.error("[hive-setup]", error));

  await boss.start();
  for (const [name, options] of [
    [QUEUES.runsDead, {}],
    [QUEUES.runs, RUNS_QUEUE_OPTIONS],
    [QUEUES.schedules, { retryLimit: 1, expireInSeconds: 120 }],
  ] as const) {
    if (await boss.getQueue(name)) {
      // pg-boss rejects an update with no properties (the DLQ has none).
      if (Object.keys(options).length > 0) {
        await boss.updateQueue(name, options);
      }
    } else {
      await boss.createQueue(name, options);
    }
  }
  await boss.stop({ graceful: false, close: true });

  const sql = postgres(connectionString, { max: 1, onnotice: () => undefined });
  await sql.unsafe(`
    GRANT USAGE ON SCHEMA ${PGBOSS_SCHEMA} TO flowledger_app_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${PGBOSS_SCHEMA} TO flowledger_app_role;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${PGBOSS_SCHEMA} TO flowledger_app_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${PGBOSS_SCHEMA} TO flowledger_app_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA ${PGBOSS_SCHEMA} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO flowledger_app_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA ${PGBOSS_SCHEMA} GRANT USAGE, SELECT ON SEQUENCES TO flowledger_app_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA ${PGBOSS_SCHEMA} GRANT EXECUTE ON FUNCTIONS TO flowledger_app_role;
  `);
  await sql.end();

  console.log(
    `[hive-setup] pg-boss schema "${PGBOSS_SCHEMA}" ready; queues: ${Object.values(QUEUES).join(", ")}`
  );
}

main().catch((error) => {
  console.error("[hive-setup] failed:", error);
  process.exit(1);
});
