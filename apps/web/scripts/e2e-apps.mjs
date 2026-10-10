/**
 * Live checks for every connector app and the AI using them. Dev server on :3000.
 *   node scripts/e2e-apps.mjs [baseUrl]
 * Uses placeholder keys: each app's real API must reject them with a clear
 * message (proves save → seal → test → provider round trip). Real keys are
 * checked by the owner on the Connections page.
 */
const B = process.argv[2] ?? "http://localhost:3000";
let cookie = "";
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};
async function call(method, path, body) {
  const res = await fetch(`${B}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: B,
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) {
    cookie = set.map((c) => c.split(";")[0]).join("; ");
  }
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const signUp = await call("POST", "/api/auth/sign-up/email", {
  email: `apps-${Date.now()}@example.test`,
  password: `${crypto.randomUUID()}Aa1`,
  name: "Apps Check",
});
check("signs up", signUp.status === 200);

const fake = "placeholder0123456789abcdef";
const APPS = {
  "ai-gateway": { apiKey: `vck_${fake}` },
  blob: { token: `vercel_blob_rw_${fake}` },
  clerk: { clerkSecretKey: `sk_test_${fake}` },
  fal: { apiKey: `${fake}:${fake}` },
  firecrawl: { firecrawlApiKey: `fc-${fake}` },
  github: { token: `ghp_${fake}` },
  linear: { apiKey: `lin_api_${fake}` },
  perplexity: { apiKey: `pplx-${fake}` },
  resend: { apiKey: `re_${fake}`, fromEmail: "team@example.test" },
  slack: { apiKey: `xoxb-${fake}` },
  stripe: { apiKey: `sk_test_${fake}` },
  superagent: { superagentApiKey: fake },
  v0: { apiKey: `v1:${fake}` },
  webflow: { apiKey: fake },
};

for (const [type, config] of Object.entries(APPS)) {
  const created = await call("POST", "/api/integrations", {
    type,
    name: type,
    config,
  });
  if (created.status !== 200) {
    check(`${type}: saves`, false, JSON.stringify(created.json));
    continue;
  }
  const id = created.json.id;
  const list = await call("GET", "/api/integrations");
  const row = list.json?.find?.((r) => r.id === id);
  const leaked = JSON.stringify(row ?? {}).includes(fake);
  const t0 = Date.now();
  const tested = await call("POST", `/api/integrations/${id}/test`);
  const ms = Date.now() - t0;
  const msg = String(tested.json?.message ?? tested.json?.error ?? "");
  check(
    `${type}: saves sealed, provider rejects a fake key clearly`,
    !leaked && tested.json?.status === "error" && msg.length > 3,
    `${ms}ms · ${msg.slice(0, 90)}`
  );
}

const wrong = await call("POST", "/api/integrations", {
  type: "stripe",
  name: "stripe",
  config: { apiKey: "pk_test_123" },
});
check(
  "wrong kind of key is caught before saving",
  wrong.status === 400 && String(wrong.json?.error).includes("secret key"),
  wrong.json?.error
);
const unknown = await call("POST", "/api/integrations", {
  type: "nope",
  name: "x",
  config: { a: "b" },
});
check("unknown app is refused", unknown.status === 400);

// The AI builds flows with the apps you name.
const PROMPTS = [
  [
    "When someone fills our contact form, post their name and message to the #sales Slack channel",
    ["slack/send-message"],
  ],
  [
    "When a bug report form is submitted, create a GitHub issue and alert our Telegram group",
    ["github/create-issue", "telegram/send-message"],
  ],
  [
    "When a customer registers on our form, create a Stripe customer and add them to our Google Sheet",
    ["stripe/create-customer", "google-sheets/append-row"],
  ],
  [
    "Every morning at 9, ask Perplexity for the latest AI news and email me a summary at owner@example.test",
    ["perplexity/", "smtp-email/send-email"],
  ],
  [
    "When a webhook arrives with a url, scrape that page with Firecrawl and create a Linear ticket with a summary",
    ["firecrawl/scrape", "linear/create-ticket"],
  ],
];
for (const [prompt, want] of PROMPTS) {
  const r = await call("POST", "/api/ai/generate", { prompt, mode: "json" });
  const actions = (r.json?.nodes ?? [])
    .map((n) => n.data?.config?.actionType)
    .filter(Boolean);
  const ok = want.every((w) => actions.some((a) => a.startsWith(w)));
  const linked = (r.json?.nodes ?? []).filter(
    (n) =>
      n.data?.config?.integrationId &&
      String(n.data.config.actionType).includes("/")
  ).length;
  check(
    `AI uses ${want.join(" + ")}`,
    ok && r.json?.source === "ai",
    `${r.json?.source}/${r.json?.model ?? "-"} → ${actions.join(", ")} · linked ${linked}`
  );
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
