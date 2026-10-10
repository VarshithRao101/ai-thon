import "server-only";

import { PgBoss } from "pg-boss";
import { PGBOSS_SCHEMA } from "./queues";

/**
 * One pg-boss client per process, connected as the least-privilege app role.
 * The schema and queues are created by the owner (scripts/hive-setup.ts), so
 * this client never migrates. Survives Next.js HMR via globalThis.
 */
const globalForBoss = globalThis as unknown as {
  hiveBoss?: Promise<PgBoss>;
};

export function getBoss(): Promise<PgBoss> {
  if (!globalForBoss.hiveBoss) {
    globalForBoss.hiveBoss = (async () => {
      const boss = new PgBoss({
        connectionString: process.env.DATABASE_URL,
        schema: PGBOSS_SCHEMA,
        application_name: "flowledger-hive",
        migrate: false,
        max: 4,
      });
      boss.on("error", (error) =>
        console.error("[hive] pg-boss error:", error)
      );
      await boss.start();
      return boss;
    })().catch((error) => {
      globalForBoss.hiveBoss = undefined;
      throw error;
    });
  }
  return globalForBoss.hiveBoss;
}
