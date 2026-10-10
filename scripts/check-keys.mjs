// Reports which keys in apps/web/.env.local are filled in, by NAME only.
// Values are never printed. Usage: node scripts/check-keys.mjs
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve(import.meta.dirname, "..", "apps", "web", ".env.local");
if (!existsSync(target)) {
  console.log("apps/web/.env.local is missing: run node scripts/dev-env.mjs");
  process.exit(1);
}
const values = new Map();
for (const line of readFileSync(target, "utf8").split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (match) {
    values.set(match[1], match[2].trim());
  }
}
const filled = (key) => (values.get(key) ?? "") !== "";

const groups = [
  ["Core (dev-env.mjs)", ["DATABASE_URL", "DATABASE_ADMIN_URL", "BETTER_AUTH_SECRET", "INTEGRATION_ENCRYPTION_KEY"]],
  ["AI (your step 4)", ["GOOGLE_GENERATIVE_AI_API_KEY", "AI_MODEL_FAST", "AI_MODEL_SMART"]],
  ["AI fallback (optional)", ["GROQ_API_KEY", "AI_FALLBACK_MODEL"]],
  ["Chain (your steps 1, 8; Claude deploys the contract)", ["CHAIN_ID", "CHAIN_RPC_URL", "ANCHORER_PRIVATE_KEY", "ANCHOR_CONTRACT_ADDRESS"]],
  ["Hosting (your step 2: Neon)", ["CLOUD_DATABASE_ADMIN_URL"]],
];
let missingRequired = 0;
for (const [title, keys] of groups) {
  console.log(`\n${title}`);
  for (const key of keys) {
    const ok = filled(key);
    if (!ok && !title.includes("optional") && !title.includes("stage")) {
      missingRequired += 1;
    }
    console.log(`  ${ok ? "✓" : "·"} ${key}`);
  }
}
console.log(
  "\nGmail, Google Sheets and Telegram credentials are entered in the app (Connections), not here."
);
console.log(missingRequired === 0 ? "\nAll required keys are set." : `\n${missingRequired} required key(s) still empty.`);
