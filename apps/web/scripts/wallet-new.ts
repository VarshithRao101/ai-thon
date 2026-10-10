/**
 * Creates the TESTNET-ONLY anchorer wallet (docs/08, K10).
 * Writes ANCHORER_PRIVATE_KEY into apps/web/.env.local if it is missing and
 * prints only the public address. Never prints or overwrites an existing key.
 * Usage: pnpm --filter @flowledger/web wallet:new
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// Run from apps/web (pnpm --filter sets the cwd).
const target = resolve(process.cwd(), ".env.local");
const KEY = "ANCHORER_PRIVATE_KEY";

const text = existsSync(target) ? readFileSync(target, "utf8") : "";
const lines = text.split(/\r?\n/);
const index = lines.findIndex((line) => line.startsWith(`${KEY}=`));
const current = index >= 0 ? lines[index].slice(KEY.length + 1).trim() : "";

let privateKey = current as `0x${string}`;
if (/^0x[0-9a-fA-F]{64}$/.test(current)) {
  console.log("[wallet] existing testnet key kept (value not shown)");
} else {
  privateKey = generatePrivateKey();
  const entry = `${KEY}=${privateKey}`;
  if (index >= 0) {
    lines[index] = entry;
  } else {
    if (lines.at(-1) === "") {
      lines.pop();
    }
    lines.push(entry, "");
  }
  writeFileSync(target, lines.join("\n"), "utf8");
  console.log(
    `[wallet] new testnet key written to apps/web/.env.local (${KEY}, value not shown)`
  );
}

const { address } = privateKeyToAccount(privateKey);
console.log(`[wallet] address: ${address}`);
console.log(
  `[wallet] fund with Amoy test POL only: https://amoy.polygonscan.com/address/${address}`
);
