/**
 * Standalone Hive worker role (docs/03): consumes the run queues without
 * serving HTTP. Run with: pnpm --filter @flowledger/web worker
 * (the react-server condition lets server-only modules load outside Next.js).
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const { startHiveWorker } = await import("../lib/hive/worker");
  await startHiveWorker();
  const { getBoss } = await import("../lib/hive/boss");
  const shutdown = async (signal: string) => {
    console.info(`[hive] ${signal}: finishing in-flight runs`);
    const boss = await getBoss();
    await boss.stop({ graceful: true, timeout: 25_000 });
    process.exit(0);
  };
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      shutdown(signal).catch(() => process.exit(1));
    });
  }
}

main().catch((error) => {
  console.error("[hive] worker crashed:", error);
  process.exit(1);
});
