// Stop the local embedded PostgreSQL cleanly (pg_ctl stop -m fast).
// Needed on Windows, where killing `pnpm db:local` can leave postgres.exe running.
// Usage: pnpm db:stop
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const dataDir = resolve(import.meta.dirname, "..", ".data", "pg");
if (!existsSync(join(dataDir, "postmaster.pid"))) {
  console.log("[dev-db] not running");
  process.exit(0);
}

const require = createRequire(import.meta.url);
const platformPkg = {
  win32: "@embedded-postgres/windows-x64",
  darwin: process.arch === "arm64" ? "@embedded-postgres/darwin-arm64" : "@embedded-postgres/darwin-x64",
  linux: process.arch === "arm64" ? "@embedded-postgres/linux-arm64" : "@embedded-postgres/linux-x64",
}[process.platform];
const binDir = join(
  dirname(require.resolve(`${platformPkg}/package.json`, { paths: [resolve(import.meta.dirname, "..")] })),
  "native",
  "bin"
);
const pgCtl = join(binDir, process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl");

execFileSync(pgCtl, ["stop", "-D", dataDir, "-m", "fast"], { stdio: "inherit" });
console.log("[dev-db] stopped");
