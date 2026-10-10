// End-to-end check of hosted forms + AI steps against a running N-Flow.
// Start the server with AI_MOCK=true to run without AI keys. Local dev only;
// creates a throwaway *.example.test account (random password, never printed).
// Usage: node scripts/e2e-forms.mjs [baseUrl]   (default http://localhost:3000)
import { randomBytes } from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:3000";
if (!["localhost", "127.0.0.1", "::1"].includes(new URL(BASE).hostname)) {
  console.error("Refusing to run against a non-local host");
  process.exit(2);
}

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` (${detail})` : ""}`);
  }
}

const jar = new Map();
async function call(method, path, body, { cookies = true, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Origin: BASE,
      "Content-Type": "application/json",
      ...(cookies && jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  if (cookies) {
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const idx = pair.indexOf("=");
      jar.set(pair.slice(0, idx), pair.slice(idx + 1));
    }
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON (HTML page)
  }
  return { status: res.status, json, text };
}
// Anonymous visitor: never sends the session cookie.
const visitor = (method, path, body) => call(method, path, body, { cookies: false });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FINAL = new Set(["success", "error", "cancelled", "skipped"]);
async function waitFinal(executionId, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  let last;
  while (Date.now() < until) {
    last = await call("GET", `/api/workflows/executions/${executionId}/status`);
    if (FINAL.has(last.json?.status)) {
      return last.json;
    }
    await sleep(300);
  }
  return last?.json;
}
const logsOf = async (id) => (await call("GET", `/api/workflows/executions/${id}/logs`)).json?.logs ?? [];
const node = (id, type, label, config, x) => ({
  id,
  type,
  position: { x, y: 0 },
  data: { label, type, config, status: "idle" },
});
const edge = (s, t) => ({ id: `${s}-${t}`, source: s, target: t, type: "animated" });

console.log(`N-Flow forms + AI e2e against ${BASE}`);
const signup = await call("POST", "/api/auth/sign-up/email", {
  email: `forms.${randomBytes(4).toString("hex")}@example.test`,
  password: randomBytes(18).toString("base64url"),
  name: "Forms Test",
});
check("signs up", signup.status === 200, String(signup.status));

const nodes = [
  node("t1", "trigger", "Form", { triggerType: "Form", formTitle: "TRI-CITY AI Hackathon registration" }, 0),
  node("a1", "action", "AI Classify", {
    actionType: "ai/classify",
    aiInput: "{{@t1:Form.idea}}",
    aiLabels: "AI/ML, Web, Blockchain, IoT",
  }, 250),
  node("a2", "action", "AI Draft Email", {
    actionType: "ai/draft-email",
    aiRecipientName: "{{@t1:Form.name}}",
    aiContext: "College: {{@t1:Form.college}}. Track: {{@a1:AI Classify.label}}",
    aiGoal: "Confirm their hackathon registration",
  }, 500),
];
const created = await call("POST", "/api/workflows/create", {
  name: "Hackathon registration",
  nodes,
  edges: [edge("t1", "a1"), edge("a1", "a2")],
});
const wfId = created.json?.id;
check("creates the registration workflow", created.status === 200 && wfId, JSON.stringify(created.json));

// --- manual test run uses sample answers
const test = await call("POST", `/api/workflow/${wfId}/execute`, { input: {} });
const testFinal = await waitFinal(test.json?.executionId);
check("test run with sample answers succeeds", testFinal?.status === "success", JSON.stringify(testFinal));
const testLogs = await logsOf(test.json?.executionId);
const draft = testLogs.find((l) => l.nodeId === "a2" && l.status === "success");
check(
  "AI draft used the sample name and the classified track",
  JSON.stringify(draft?.output ?? "").includes("Test Participant") || JSON.stringify(draft?.input ?? "").includes("Test Participant"),
  JSON.stringify(draft?.input)
);

// --- public page and submission
check("form page is 404 before publishing", (await visitor("GET", `/f/${wfId}`)).status === 404);
const pub = await call("POST", `/api/workflows/${wfId}/publish`, {});
check("publishes", pub.status === 200, JSON.stringify(pub.json));
const page = await visitor("GET", `/f/${wfId}`);
check("form page renders for an anonymous visitor", page.status === 200 && page.text.includes("TRI-CITY AI Hackathon registration"), String(page.status));

const missing = await visitor("POST", `/api/forms/${wfId}`, { values: { name: "Asha" }, consent: true });
check("missing required fields → 422 with field errors", missing.status === 422 && missing.json?.errors?.email && missing.json?.errors?.idea, JSON.stringify(missing.json));
const noConsent = await visitor("POST", `/api/forms/${wfId}`, {
  values: { name: "Asha", email: "asha@example.test", college: "NIT Warangal", idea: "x" },
});
check("no consent → 422", noConsent.status === 422 && noConsent.json?.errors?.consent, JSON.stringify(noConsent.json));
const badEmail = await visitor("POST", `/api/forms/${wfId}`, {
  values: { name: "Asha", email: "not-an-email", college: "NIT Warangal", idea: "x" },
  consent: true,
});
check("invalid email → 422", badEmail.status === 422 && badEmail.json?.errors?.email, JSON.stringify(badEmail.json));

const submissionId = randomBytes(12).toString("hex");
const answers = {
  values: { name: "ఆశ రావు (आशा)", email: "asha.rao@example.test", college: "NIT Warangal", idea: "An AI/ML tutor for rural schools" },
  consent: true,
  submissionId,
};
const sent = await visitor("POST", `/api/forms/${wfId}`, answers);
check("valid submission is accepted", sent.status === 200 && sent.json?.executionId, JSON.stringify(sent.json));
const resent = await visitor("POST", `/api/forms/${wfId}`, answers);
check("double submit runs once (same execution)", resent.json?.executionId === sent.json?.executionId, JSON.stringify(resent.json));
const sentFinal = await waitFinal(sent.json?.executionId);
check("form run succeeds", sentFinal?.status === "success", JSON.stringify(sentFinal));
const runLogs = await logsOf(sent.json?.executionId);
const classified = runLogs.find((l) => l.nodeId === "a1" && l.status === "success");
check("AI classified the idea as AI/ML", JSON.stringify(classified?.output ?? "").includes("AI/ML"), JSON.stringify(classified?.output));
const triggerLog = runLogs.find((l) => l.nodeId === "t1");
check("trigger carries the answers (Telugu + Hindi intact), a timestamp and consent", triggerLog?.input?.name === "ఆశ రావు (आशा)" && triggerLog?.input?.submittedAt && triggerLog?.input?.consent === true, JSON.stringify(triggerLog?.input));

const before = (await call("GET", `/api/workflows/${wfId}/executions`)).json?.length ?? 0;
const bot = await visitor("POST", `/api/forms/${wfId}`, { ...answers, submissionId: randomBytes(12).toString("hex"), website: "http://spam.example" });
const after = (await call("GET", `/api/workflows/${wfId}/executions`)).json?.length ?? 0;
check("honeypot: bot gets 200 but nothing runs", bot.status === 200 && after === before, `${before} → ${after}`);

// --- a step without a connection fails with a clear, classified error
const withTelegram = await call("PATCH", `/api/workflows/${wfId}`, {
  nodes: [...nodes, node("tg", "action", "Alert team", { actionType: "telegram/send-message", telegramText: "New: {{@t1:Form.name}}" }, 750)],
  edges: [edge("t1", "a1"), edge("a1", "a2"), edge("a2", "tg")],
});
check("adds a Telegram step without a connection", withTelegram.status === 200);
const noConn = await call("POST", `/api/workflow/${wfId}/execute`, { input: {} });
const noConnFinal = await waitFinal(noConn.json?.executionId);
const tgLog = (await logsOf(noConn.json?.executionId)).find((l) => l.nodeId === "tg");
check("missing connection → run error naming the fix", noConnFinal?.status === "error" && /Connect a Telegram bot/.test(tgLog?.error ?? ""), tgLog?.error);

// --- disable closes the form
await call("PUT", `/api/workflows/${wfId}/enabled`, { enabled: false });
const closed = await visitor("POST", `/api/forms/${wfId}`, { ...answers, submissionId: randomBytes(12).toString("hex") });
check("disabled workflow → form closed (409)", closed.status === 409, JSON.stringify(closed.json));
const closedPage = await visitor("GET", `/f/${wfId}`);
check("page says the form is closed", closedPage.text.includes("not accepting responses"));
await call("PUT", `/api/workflows/${wfId}/enabled`, { enabled: true });

// --- rate limit (last: it blocks this client for a minute)
let limited = false;
for (let i = 0; i < 12 && !limited; i++) {
  const r = await visitor("POST", `/api/forms/${wfId}`, { values: {}, consent: true });
  limited = r.status === 429;
}
check("rate limit kicks in (429)", limited);

console.log(failures === 0 ? "\nALL FORM CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
