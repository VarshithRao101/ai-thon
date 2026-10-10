// End-to-end check of the Hive engine against a running FlowLedger (local dev only).
// Creates a throwaway *.example.test account (random password, never printed).
// Usage: node scripts/e2e-hive.mjs [baseUrl]   (default http://localhost:3000)
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
async function call(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Origin: BASE,
      "Content-Type": "application/json",
      ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  for (const cookie of res.headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    const idx = pair.indexOf("=");
    jar.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    // empty body
  }
  return { status: res.status, json };
}

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

async function logsOf(executionId) {
  const res = await call("GET", `/api/workflows/executions/${executionId}/logs`);
  return res.json?.logs ?? [];
}

function node(id, type, label, config, x) {
  return { id, type, position: { x, y: 0 }, data: { label, type, config, status: "idle" } };
}
const edge = (source, target) => ({ id: `${source}-${target}`, source, target, type: "animated" });
const trace = (logs) => logs.map((l) => `${l.nodeId}:${l.status}`).join(",");

const suffix = randomBytes(4).toString("hex");
console.log(`FlowLedger Hive e2e against ${BASE}`);
const signup = await call("POST", "/api/auth/sign-up/email", {
  email: `hive.${suffix}@example.test`,
  password: randomBytes(18).toString("base64url"),
  name: "Hive Test",
});
check("signs up", signup.status === 200, String(signup.status));

// trigger → condition(score > 5) → delay 2 s
const nodes = [
  node("t1", "trigger", "Trigger", { triggerType: "Webhook" }, 0),
  node("c1", "action", "Is hot", { actionType: "Condition", condition: "{{@t1:Trigger.score}} > 5" }, 250),
  node("d1", "action", "Wait", { actionType: "Delay", delaySeconds: 2 }, 500),
];
const created = await call("POST", "/api/workflows/create", {
  name: "Hive e2e",
  nodes,
  edges: [edge("t1", "c1"), edge("c1", "d1")],
});
const wfId = created.json?.id;
check("creates a workflow", created.status === 200 && wfId, JSON.stringify(created.json));

// --- manual draft runs: branching + durable wait
const hot = await call("POST", `/api/workflow/${wfId}/execute`, { input: { score: 9 } });
check("manual run is queued", hot.status === 200 && hot.json?.status === "queued", JSON.stringify(hot.json));
const hotFinal = await waitFinal(hot.json?.executionId);
check("hot run succeeds after the durable wait", hotFinal?.status === "success", JSON.stringify(hotFinal));
const hotLogs = await logsOf(hot.json?.executionId);
check(
  "delay step was suspended, then resumed",
  hotLogs.some((l) => l.nodeId === "d1" && l.status === "waiting") &&
    hotLogs.some((l) => l.nodeId === "d1" && l.status === "success"),
  trace(hotLogs)
);
check("trigger ran exactly once across suspend/resume", hotLogs.filter((l) => l.nodeId === "t1").length === 1, trace(hotLogs));

const cold = await call("POST", `/api/workflow/${wfId}/execute`, { input: { score: 1 } });
const coldFinal = await waitFinal(cold.json?.executionId);
check("cold run succeeds", coldFinal?.status === "success", JSON.stringify(coldFinal));
const coldLogs = await logsOf(cold.json?.executionId);
check("false branch skips the delay", coldLogs.some((l) => l.nodeId === "d1" && l.status === "skipped"), trace(coldLogs));

// --- publish, enable/disable, idempotency through the webhook trigger
const key = await call("POST", "/api/api-keys", { name: "hive e2e" });
const apiKey = key.json?.key;
check("creates an API key", key.status === 200 && typeof apiKey === "string", String(key.status));
const hook = (headers = {}) =>
  fetch(`${BASE}/api/workflows/${wfId}/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, ...headers },
    body: JSON.stringify({ score: 7 }),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

const unpublished = await hook();
check(
  "webhook on an unpublished workflow → 409 skipped",
  unpublished.status === 409 && unpublished.json?.status === "skipped",
  JSON.stringify(unpublished)
);

const published = await call("POST", `/api/workflows/${wfId}/publish`, {});
check(
  "publishes version 1 with a definition hash",
  published.status === 200 &&
    published.json?.version === 1 &&
    /^0x[0-9a-f]{64}$/.test(published.json?.definitionHash ?? ""),
  JSON.stringify(published.json)
);

const first = await hook({ "Idempotency-Key": `order-${suffix}` });
check("webhook runs the published version", first.status === 200 && first.json?.status === "queued", JSON.stringify(first));
const again = await hook({ "Idempotency-Key": `order-${suffix}` });
check(
  "same Idempotency-Key → same execution",
  again.status === 200 && again.json?.duplicate === true && again.json?.executionId === first.json?.executionId,
  JSON.stringify(again)
);
const webhookFinal = await waitFinal(first.json?.executionId);
check("webhook run succeeds", webhookFinal?.status === "success", JSON.stringify(webhookFinal));

check("disables the workflow", (await call("PUT", `/api/workflows/${wfId}/enabled`, { enabled: false })).status === 200);
const disabled = await hook();
check("webhook on a disabled workflow → 409 skipped", disabled.status === 409 && disabled.json?.status === "skipped", JSON.stringify(disabled));
check("re-enables the workflow", (await call("PUT", `/api/workflows/${wfId}/enabled`, { enabled: true })).status === 200);
check("webhook works again", (await hook()).status === 200);

// --- failure → retry resumes from the failed step
const broken = await call("PATCH", `/api/workflows/${wfId}`, {
  nodes: [...nodes.slice(0, 2), node("x1", "action", "Broken", { actionType: "nope/not-a-step" }, 500)],
  edges: [edge("t1", "c1"), edge("c1", "x1")],
});
check("saves a draft with a broken step", broken.status === 200, JSON.stringify(broken.json));
const bad = await call("POST", `/api/workflow/${wfId}/execute`, { input: { score: 9 } });
const badFinal = await waitFinal(bad.json?.executionId);
check("broken run fails", badFinal?.status === "error", JSON.stringify(badFinal));
const retry = await call("POST", `/api/workflows/executions/${bad.json?.executionId}/retry`);
check("retry is accepted", retry.status === 200, JSON.stringify(retry.json));
await sleep(500);
await waitFinal(bad.json?.executionId);
const retryLogs = await logsOf(bad.json?.executionId);
check(
  "retry did not repeat completed steps",
  retryLogs.filter((l) => l.nodeId === "t1").length === 1 && retryLogs.filter((l) => l.nodeId === "c1").length === 1,
  trace(retryLogs)
);
check("retry re-ran the failed step", retryLogs.filter((l) => l.nodeId === "x1").length === 2, trace(retryLogs));
check(
  "a successful run cannot be retried",
  (await call("POST", `/api/workflows/executions/${hot.json?.executionId}/retry`)).status === 409
);

const invalid = await call("PATCH", `/api/workflows/${wfId}`, { nodes: [nodes[1]], edges: [] });
check("saves a draft without a trigger", invalid.status === 200);
const rejected = await call("POST", `/api/workflows/${wfId}/publish`, {});
check(
  "publish rejects an invalid graph with issues",
  rejected.status === 422 && Array.isArray(rejected.json?.issues) && rejected.json.issues.length > 0,
  JSON.stringify(rejected.json)
);

console.log(failures === 0 ? "\nALL HIVE CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
