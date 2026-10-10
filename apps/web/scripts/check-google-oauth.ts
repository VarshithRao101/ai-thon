/**
 * Google sign-in wiring check (no browser, no Google account needed).
 * With placeholder OAuth values (or your real ones, if .env.local has them)
 * it asks Better Auth to start "Continue with Google" and checks the redirect:
 * Google's consent URL, our callback, the right scopes, CSRF state and PKCE.
 * Also checks the test-mode bypass switches off once OAuth is configured.
 *
 *   pnpm --filter @flowledger/web check:google
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const placeholder = !process.env.GOOGLE_CLIENT_ID;
if (placeholder) {
  process.env.GOOGLE_CLIENT_ID =
    "1234567890-placeholder.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "placeholder-secret";
}
process.env.NEXT_PUBLIC_AUTH_PROVIDERS ||= "google,email";
process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||= process.env.GOOGLE_CLIENT_ID;

const TRAILING_SLASH = /\/$/;
const STATE_COOKIE = /state/i;

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail?: string) =>
  checks.push({ name, ok, ...(ok ? {} : { detail }) });

async function main() {
  const { auth } = await import("../lib/auth");
  const { demoLoginEnabled } = await import("../lib/auth/demo-login");
  const { getEnabledAuthProviders } = await import("../lib/auth-providers");

  const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(
    TRAILING_SLASH,
    ""
  );
  const res = await auth.api.signInSocial({
    body: { provider: "google", callbackURL: "/dashboard" },
    headers: new Headers({ origin: base }),
    asResponse: true,
  });
  const body = (await res.json().catch(() => ({}))) as {
    url?: string;
    redirect?: boolean;
  };
  check(
    "Better Auth starts Google sign-in",
    res.ok && Boolean(body.url),
    `HTTP ${res.status}`
  );
  const url = body.url ? new URL(body.url) : null;
  const q = url?.searchParams;
  check(
    "redirects to Google's consent screen",
    url?.host === "accounts.google.com",
    url?.host
  );
  check(
    "sends our client id",
    q?.get("client_id") === process.env.GOOGLE_CLIENT_ID
  );
  const callback = `${base}/api/auth/callback/google`;
  check(
    `callback is ${callback}`,
    q?.get("redirect_uri") === callback,
    q?.get("redirect_uri") ?? ""
  );
  const scopes = (q?.get("scope") ?? "").split(" ");
  check(
    "asks only for openid, email, profile",
    ["openid", "email", "profile"].every((s) => scopes.includes(s)) &&
      scopes.length <= 3,
    scopes.join(" ")
  );
  check("uses the authorization-code flow", q?.get("response_type") === "code");
  check("has CSRF state", (q?.get("state") ?? "").length >= 16);
  check(
    "uses PKCE (S256)",
    q?.get("code_challenge_method") === "S256" &&
      Boolean(q?.get("code_challenge"))
  );
  const cookies = res.headers.getSetCookie().join("; ");
  check(
    "sets the state cookie for the callback",
    STATE_COOKIE.test(cookies),
    cookies.slice(0, 80)
  );

  check(
    "login page shows Google when configured",
    getEnabledAuthProviders().google
  );
  check(
    "test-mode bypass is OFF once OAuth is configured",
    !demoLoginEnabled()
  );

  for (const c of checks) {
    console.log(
      `${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  (${c.detail})` : ""}`
    );
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(
    `\nGoogle OAuth wiring: ${checks.length - failed}/${checks.length} checks${placeholder ? " (placeholder client id; real keys not set yet)" : " (your real client id)"}.`
  );
  console.log(
    `Add these in Google Cloud → Credentials → your OAuth client:\n  Authorized JavaScript origin: ${base}\n  Authorized redirect URI:      ${callback}`
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("[check-google] crashed:", error);
  process.exit(1);
});
