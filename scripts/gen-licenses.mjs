// Writes apps/web/lib/legal/licenses.json: name, version and license of every
// direct dependency of the web app and the workspace packages, read from the
// installed package.json files (for /legal/open-source).
// Usage: node scripts/gen-licenses.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifests = ["apps/web", "packages/engine", "packages/ledger", "packages/contracts", "packages/config"];
const seen = new Map();
for (const dir of manifests) {
  const pkgPath = resolve(root, dir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const require = createRequire(pkgPath);
  for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
    if (name.startsWith("@flowledger/") || seen.has(name)) {
      continue;
    }
    try {
      const manifest = require(`${name}/package.json`);
      const license = typeof manifest.license === "string" ? manifest.license : manifest.license?.type ?? "see package";
      seen.set(name, { name, version: manifest.version, license, homepage: manifest.homepage ?? null });
    } catch {
      // Packages that hide package.json via "exports": read it from node_modules directly.
      try {
        const manifest = JSON.parse(readFileSync(resolve(root, dir, "node_modules", name, "package.json"), "utf8"));
        seen.set(name, { name, version: manifest.version, license: manifest.license ?? "see package", homepage: manifest.homepage ?? null });
      } catch {
        seen.set(name, { name, version: "?", license: "see package", homepage: null });
      }
    }
  }
}
const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(resolve(root, "apps/web/lib/legal/licenses.json"), `${JSON.stringify(list, null, 2)}\n`);
const counts = {};
for (const item of list) {
  counts[item.license] = (counts[item.license] ?? 0) + 1;
}
console.log(`[licenses] ${list.length} packages:`, counts);
