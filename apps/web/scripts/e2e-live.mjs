/**
 * Live end-to-end smoke test with REAL services (no mocks): the configured AI
 * model builds a workflow from a sentence, it is published, a form submission
 * runs it, and the dashboard shows it.
 *
 *   node scripts/e2e-live.mjs [screenshot.png]   (dev server on :3000)
 *
 * Uses the test-mode sign-in (/api/demo-login), so run it before Google OAuth
 * is configured, or set E2E_COOKIE to a session cookie.
 */
import { chromium } from "@playwright/test";

const B = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const shot = process.argv[2];
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${B}/login`, { waitUntil: "load" });
await page.waitForTimeout(1500);

const api = (method, path, payload) =>
  page.evaluate(
    async ([m, p, b]) => {
      const r = await fetch(p, {
        method: m,
        headers: { "content-type": "application/json" },
        body: b ? JSON.stringify(b) : undefined,
      });
      let j = null;
      try {
        j = await r.json();
      } catch {
        // not JSON (e.g. an HTML error page)
      }
      return { status: r.status, json: j };
    },
    [method, path, payload]
  );
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};

// Test-mode sign-in while Google OAuth isn't set up; otherwise a throwaway
// email account (*.example.test), so no Google login is needed.
let signedIn = (await api("POST", "/api/demo-login")).status === 200;
if (!signedIn) {
  const signUp = await api("POST", "/api/auth/sign-up/email", {
    email: `live-${Date.now()}@example.test`,
    password: `${crypto.randomUUID()}Aa1`,
    name: "Live Check",
  });
  signedIn = signUp.status === 200;
}
check("signed in", signedIn);

let t0 = Date.now();
const gen = await api("POST", "/api/ai/generate", {
  prompt:
    "When someone submits my form with their name, email and project idea, use AI to classify the idea as AI/ML, Web3 or Other, then use AI to write a one-line summary of the idea",
  mode: "json",
});
const steps = (gen.json?.nodes ?? []).map(
  (n) => n.data.config.actionType ?? n.data.config.triggerType
);
check(
  "Copilot builds it with real AI",
  gen.status === 200 && gen.json?.source === "ai",
  `${gen.json?.model} ${Date.now() - t0} ms: ${steps.join(" > ")}`
);

const created = await api("POST", "/api/workflows/create", {
  name: gen.json?.name,
  description: gen.json?.description,
  nodes: gen.json?.nodes,
  edges: gen.json?.edges,
});
const id = created.json?.id;
const pub = await api("POST", `/api/workflows/${id}/publish`, {});
check(
  "publishes",
  pub.status === 200,
  JSON.stringify(pub.json?.issues ?? "").slice(0, 160)
);
check(
  "turns on",
  (await api("PUT", `/api/workflows/${id}/enabled`, { enabled: true }))
    .status === 200
);

const trigger = gen.json.nodes.find((n) => n.type === "trigger");
const fields = JSON.parse(trigger.data.config.formFields);
const IDEA_KEY = /idea|project|desc/i;
const sample = (f) => {
  if (f.type === "email") {
    return "asha.rao@example.test";
  }
  return IDEA_KEY.test(f.key)
    ? "A Telugu voice chatbot that uses a fine-tuned LLM to give farmers crop advice"
    : "Asha Rao";
};
const values = Object.fromEntries(fields.map((f) => [f.key, sample(f)]));
t0 = Date.now();
const sent = await api("POST", `/api/forms/${id}`, {
  values,
  consent: true,
  submissionId: crypto.randomUUID().replace(/-/g, ""),
});
check(
  "form submission accepted",
  sent.status === 200 && Boolean(sent.json?.executionId)
);
const exec = sent.json?.executionId;

let st;
for (let i = 0; i < 90; i++) {
  st = await api("GET", `/api/workflows/executions/${exec}/status`);
  if (["success", "error"].includes(st.json?.status)) {
    break;
  }
  await page.waitForTimeout(1000);
}
check("run succeeds", st.json?.status === "success", `${Date.now() - t0} ms`);
const logs =
  (await api("GET", `/api/workflows/executions/${exec}/logs`)).json?.logs ?? [];
for (const l of logs) {
  console.log(
    `        ${l.status.padEnd(8)} ${l.nodeName ?? l.nodeId}: ${JSON.stringify(l.output ?? l.error ?? "").slice(0, 150)}`
  );
}

await page.goto(`${B}/dashboard`, { waitUntil: "load" });
await page.waitForTimeout(6000);
const body = (await page.innerText("body")).replace(/\s+/g, " ");
check(
  "dashboard shows the run",
  body.includes(gen.json?.name ?? "~"),
  body.slice(0, 120)
);
if (shot) {
  await page.screenshot({ path: shot, fullPage: true });
}
check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();
const failed = results.filter((ok) => !ok).length;
console.log(
  failed ? `\n${failed} LIVE CHECK(S) FAILED` : "\nALL LIVE CHECKS PASSED"
);
process.exit(failed ? 1 : 0);
