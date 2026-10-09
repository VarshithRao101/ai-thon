// Creates or upgrades apps/web/.env.local for local development.
// Generates fresh random secrets for missing keys, keeps existing secrets,
// and never prints any value.
// Usage: node scripts/dev-env.mjs
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve(import.meta.dirname, "..", "apps", "web", ".env.local");
const port = process.env.DEV_DB_PORT ?? "5433";
const appUrl = `postgres://flowledger_app:flowledger_app@localhost:${port}/flowledger`;
const adminUrl = `postgres://flowledger:flowledger@localhost:${port}/flowledger`;

const lines = existsSync(target) ? readFileSync(target, "utf8").split(/\r?\n/) : [];
const values = new Map();
for (const line of lines) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (match) values.set(match[1], match[2]);
}

const changed = [];
function ensure(key, makeValue, { replaceIf } = {}) {
  const current = values.get(key);
  if (current === undefined || current === "" || (replaceIf && replaceIf(current))) {
    values.set(key, makeValue());
    changed.push(key);
  }
}

// The app must not connect as the owner, or RLS is bypassed (docs/10).
ensure("DATABASE_URL", () => appUrl, { replaceIf: (v) => v === adminUrl });
ensure("DATABASE_ADMIN_URL", () => adminUrl);
ensure("BETTER_AUTH_SECRET", () => randomBytes(32).toString("base64url"));
ensure("BETTER_AUTH_URL", () => "http://localhost:3000");
ensure("INTEGRATION_ENCRYPTION_KEY", () => randomBytes(32).toString("hex"));
ensure("VAULT_MASTER_KEY_V1", () => values.get("INTEGRATION_ENCRYPTION_KEY"));

const out = [
  "# Local development only. Managed by scripts/dev-env.mjs. Never commit.",
  ...[...values.entries()].map(([k, v]) => `${k}=${v}`),
  "",
];
writeFileSync(target, out.join("\n"), "utf8");
console.log(
  changed.length
    ? `[dev-env] apps/web/.env.local updated: ${changed.join(", ")} (values not shown)`
    : "[dev-env] apps/web/.env.local already complete"
);
