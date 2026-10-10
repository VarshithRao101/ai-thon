// Google credentials helper. Never prints secrets.
//
//   node scripts/google-setup.mjs [path/to/client_secret_….json]
//
// 1. A Google OAuth client JSON ("Web application", downloaded from Google
//    Cloud → Credentials), given as a file path OR pasted raw into
//    apps/web/.env.local, becomes GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET /
//    NEXT_PUBLIC_GOOGLE_CLIENT_ID / NEXT_PUBLIC_AUTH_PROVIDERS=google,email.
// 2. A service-account JSON pasted raw into .env.local (for the Sheets
//    connector) is folded into one GOOGLE_SERVICE_ACCOUNT_JSON= line so the
//    file stays valid. Users still connect Sheets in the app (Connections).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve(import.meta.dirname, "..", "apps", "web", ".env.local");
if (!existsSync(target)) {
  console.error("apps/web/.env.local is missing");
  process.exit(1);
}
let lines = readFileSync(target, "utf8").split(/\r?\n/);

// Pull raw JSON blocks (lines that are not KEY=VALUE) out of the env file.
const blocks = [];
const kept = [];
let buffer = null;
let depth = 0;
for (const line of lines) {
  const isKv = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line) || /^\s*#/.test(line) || !line.trim();
  if (buffer === null && !isKv && line.trim().startsWith("{")) {
    buffer = [];
    depth = 0;
  }
  if (buffer !== null) {
    buffer.push(line);
    for (const ch of line) {
      if (ch === "{") depth += 1;
      if (ch === "}") depth -= 1;
    }
    if (depth <= 0) {
      blocks.push(buffer.join("\n"));
      buffer = null;
    }
    continue;
  }
  kept.push(line);
}
if (buffer !== null) {
  kept.push(...buffer);
}
lines = kept;

const parsed = [];
for (const raw of blocks) {
  try {
    parsed.push(JSON.parse(raw));
  } catch {
    console.warn("[google-setup] skipped a pasted block that is not valid JSON (left out of .env.local; paste it again)");
  }
}
const fileArg = process.argv[2];
if (fileArg) {
  parsed.push(JSON.parse(readFileSync(resolve(fileArg), "utf8")));
}

const set = (key, value) => {
  const i = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (i >= 0) {
    lines[i] = `${key}=${value}`;
  } else {
    lines.push(`${key}=${value}`);
  }
};
const changed = [];
for (const json of parsed) {
  const client = json.web ?? json.installed;
  if (client?.client_id && client?.client_secret) {
    if (!json.web) {
      console.warn("[google-setup] this OAuth client is not a \"Web application\" type; create a Web client for sign-in");
    }
    set("GOOGLE_CLIENT_ID", client.client_id);
    set("GOOGLE_CLIENT_SECRET", client.client_secret);
    set("NEXT_PUBLIC_GOOGLE_CLIENT_ID", client.client_id);
    set("NEXT_PUBLIC_AUTH_PROVIDERS", "google,email");
    changed.push("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "NEXT_PUBLIC_GOOGLE_CLIENT_ID", "NEXT_PUBLIC_AUTH_PROVIDERS");
    const uris = client.redirect_uris ?? [];
    const want = "http://localhost:3000/api/auth/callback/google";
    console.log(
      uris.includes(want)
        ? "[google-setup] redirect URI for localhost is registered"
        : `[google-setup] add this Authorized redirect URI in Google Cloud: ${want}`
    );
  } else if (json.type === "service_account" && json.client_email && json.private_key) {
    set("GOOGLE_SERVICE_ACCOUNT_JSON", JSON.stringify(json));
    changed.push("GOOGLE_SERVICE_ACCOUNT_JSON");
    console.log(
      `[google-setup] service account for Sheets: share your Sheet with ${json.client_email} (Editor), then paste the key in the app → Connections → Google Sheets`
    );
  }
}

writeFileSync(target, `${lines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
console.log(
  changed.length
    ? `[google-setup] .env.local updated: ${[...new Set(changed)].join(", ")} (values not shown)`
    : "[google-setup] no Google OAuth client or service account JSON found"
);
if (!changed.includes("GOOGLE_CLIENT_ID")) {
  console.log(
    "[google-setup] Google sign-in still needs an OAuth client: Google Cloud → APIs & Services → Credentials → Create credentials → OAuth client ID → Web application. Download its JSON and run: node scripts/google-setup.mjs <that file>"
  );
}
