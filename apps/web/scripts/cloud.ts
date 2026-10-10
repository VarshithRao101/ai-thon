/**
 * Cloud setup for the hosted app (D-047): Neon Postgres + Vercel.
 *
 *   pnpm cloud:db                         roles, migrations and queues on Neon
 *   pnpm cloud:env --url https://….vercel.app [--project name]
 *                                         push production env vars to Vercel
 *
 * Inputs: CLOUD_DATABASE_ADMIN_URL and the AI/chain keys in apps/web/.env.local.
 * Generated cloud secrets live in apps/web/.env.cloud.local (gitignored).
 * Never prints a value: only names.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import postgres from "postgres";

const root = resolve(process.cwd());
const localPath = resolve(root, ".env.local");
// CLOUD_ENV_FILE / CLOUD_DATABASE_ADMIN_URL overrides exist for dry runs.
const cloudPath = resolve(
  root,
  process.env.CLOUD_ENV_FILE ?? ".env.cloud.local"
);

function readEnv(path: string): Record<string, string> {
  return existsSync(path) ? parse(readFileSync(path, "utf8")) : {};
}

function writeCloud(values: Record<string, string>) {
  const lines = [
    "# Hosted (Vercel + Neon) values. Managed by scripts/cloud.ts. Never commit or share.",
    ...Object.entries(values).map(([k, v]) => `${k}=${v}`),
    "",
  ];
  writeFileSync(cloudPath, lines.join("\n"), "utf8");
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed (exit ${result.status})`);
  }
}

async function setupDb() {
  const local = readEnv(localPath);
  const adminUrl =
    process.env.CLOUD_DATABASE_ADMIN_URL ?? local.CLOUD_DATABASE_ADMIN_URL;
  if (!adminUrl) {
    throw new Error(
      "Set CLOUD_DATABASE_ADMIN_URL in apps/web/.env.local (Neon, pooling off). See docs/19 §9."
    );
  }
  const cloud = readEnv(cloudPath);
  cloud.CLOUD_APP_PASSWORD ||= randomBytes(24).toString("base64url");
  cloud.BETTER_AUTH_SECRET ||= randomBytes(32).toString("base64url");
  cloud.INTEGRATION_ENCRYPTION_KEY ||= randomBytes(32).toString("hex");
  cloud.VAULT_MASTER_KEY_V1 ||= cloud.INTEGRATION_ENCRYPTION_KEY;
  cloud.CRON_SECRET ||= randomBytes(24).toString("base64url");

  const appUrl = new URL(adminUrl);
  appUrl.username = "flowledger_app";
  appUrl.password = cloud.CLOUD_APP_PASSWORD;
  cloud.DATABASE_URL = appUrl.toString();
  cloud.DATABASE_ADMIN_URL = adminUrl;
  writeCloud(cloud);

  const admin = postgres(adminUrl, { max: 1, onnotice: () => undefined });
  const password = cloud.CLOUD_APP_PASSWORD.replaceAll("'", "''");
  await admin.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flowledger_app_role') THEN
        CREATE ROLE flowledger_app_role NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flowledger_app') THEN
        CREATE ROLE flowledger_app LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS;
      ELSE
        ALTER ROLE flowledger_app WITH LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS;
      END IF;
    END
    $$;
    GRANT flowledger_app_role TO flowledger_app;
  `);
  await admin.end();
  console.log("[cloud] roles ready (flowledger_app_role, flowledger_app)");

  const env = {
    ...process.env,
    DATABASE_ADMIN_URL: adminUrl,
    DATABASE_URL: cloud.DATABASE_URL,
  };
  run("pnpm", ["exec", "drizzle-kit", "migrate"], env);
  run("pnpm", ["exec", "tsx", "scripts/hive-setup.ts"], env);

  const app = postgres(cloud.DATABASE_URL, { max: 1 });
  const [who] = await app<{ role: string; bypass: boolean }[]>`
    select current_user as role, rolbypassrls as bypass
    from pg_roles where rolname = current_user`;
  await app.end();
  if (!who || who.bypass) {
    throw new Error("The app role bypasses RLS; refusing to continue");
  }
  console.log(
    `[cloud] Neon ready: migrations + queues applied; app connects as ${who.role} (RLS enforced). Secrets: apps/web/.env.cloud.local`
  );
}

// Copied from .env.local when filled. Never the laptop DB or auth values.
const FROM_LOCAL = [
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "AI_PRIMARY_PROVIDER",
  "AI_MODEL_FAST",
  "AI_MODEL_SMART",
  "GROQ_API_KEY",
  "AI_FALLBACK_PROVIDER",
  "AI_FALLBACK_MODEL",
  "CONTACT_EMAIL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "AI_COMPAT_BASE_URL",
  "AI_COMPAT_API_KEY",
  "AI_COMPAT_MODEL",
];
const SENSITIVE = new Set([
  "DATABASE_URL",
  "DATABASE_ADMIN_URL",
  "BETTER_AUTH_SECRET",
  "INTEGRATION_ENCRYPTION_KEY",
  "VAULT_MASTER_KEY_V1",
  "CRON_SECRET",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GROQ_API_KEY",
  "GOOGLE_CLIENT_SECRET",
  "AI_COMPAT_API_KEY",
]);

function vercel(args: string[], input?: string) {
  return spawnSync("npx", ["--yes", "vercel@latest", ...args], {
    cwd: resolve(root, "..", ".."),
    input,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

const TRAILING_SLASH = /\/$/;
const NEWLINE = /\r?\n/;

function ensureLinked() {
  if (existsSync(resolve(root, "..", "..", ".vercel", "project.json"))) {
    return;
  }
  const project = arg("project");
  if (!project) {
    throw new Error("Not linked yet: pass --project <vercel project name>");
  }
  const link = vercel(["link", "--yes", "--project", project]);
  if (link.status !== 0) {
    throw new Error(`vercel link failed: ${link.stderr || link.stdout}`);
  }
}

function productionValues(url: string): Record<string, string> {
  const local = readEnv(localPath);
  const cloud = readEnv(cloudPath);
  if (!cloud.DATABASE_URL) {
    throw new Error("Run pnpm cloud:db first");
  }
  const values: Record<string, string> = {
    DATABASE_URL: cloud.DATABASE_URL,
    DATABASE_ADMIN_URL: cloud.DATABASE_ADMIN_URL,
    BETTER_AUTH_SECRET: cloud.BETTER_AUTH_SECRET,
    INTEGRATION_ENCRYPTION_KEY: cloud.INTEGRATION_ENCRYPTION_KEY,
    VAULT_MASTER_KEY_V1: cloud.VAULT_MASTER_KEY_V1,
    CRON_SECRET: cloud.CRON_SECRET,
    BETTER_AUTH_URL: url,
    NEXT_PUBLIC_APP_URL: url,
    PUBLIC_APP_URL: url,
    REQUIRE_RLS: "true",
    HIVE_MODE: "serverless",
    DEMO_TAMPER_ENABLED: "true",
    NEXT_PUBLIC_AUTH_PROVIDERS: local.GOOGLE_CLIENT_ID
      ? "google,email"
      : "email",
  };
  if (local.GOOGLE_CLIENT_ID) {
    values.NEXT_PUBLIC_GOOGLE_CLIENT_ID = local.GOOGLE_CLIENT_ID;
  }
  for (const key of FROM_LOCAL) {
    if (local[key]) {
      values[key] = local[key];
    }
  }
  return values;
}

function setVercelEnv(name: string, value: string) {
  vercel(["env", "rm", name, "production", "--yes"]);
  const flags = SENSITIVE.has(name) ? ["--sensitive"] : [];
  let added = vercel(["env", "add", name, "production", ...flags], value);
  if (added.status !== 0 && flags.length > 0) {
    added = vercel(["env", "add", name, "production"], value);
  }
  const result =
    added.status === 0
      ? "set"
      : `FAILED ${(added.stderr || "").split(NEWLINE)[0]}`;
  console.log(`[cloud] ${name}: ${result}`);
}

function syncEnv() {
  const url = arg("url")?.replace(TRAILING_SLASH, "");
  if (!url?.startsWith("https://")) {
    throw new Error("Pass --url https://<project>.vercel.app");
  }
  ensureLinked();
  const values = productionValues(url);
  for (const [name, value] of Object.entries(values)) {
    setVercelEnv(name, value);
  }
  const skipped = FROM_LOCAL.filter((k) => !(k in values));
  if (skipped.length > 0) {
    console.log(`[cloud] not set yet (empty locally): ${skipped.join(", ")}`);
  }
  console.log(
    "[cloud] done. Redeploy (git push to main, or Vercel → Deployments → Redeploy) so the build picks them up."
  );
}

const commands: Record<string, () => Promise<void>> = {
  db: setupDb,
  env: () => Promise.resolve(syncEnv()),
};
const job =
  commands[process.argv[2] ?? ""] ??
  (() =>
    Promise.reject(new Error("usage: cloud.ts db | env --url <https://…>")));
job().catch((error: unknown) => {
  console.error(`[cloud] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
