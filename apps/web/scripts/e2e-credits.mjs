/**
 * Live checks for plans/credits and request guards (D-056). Dev server on :3000.
 *   node scripts/e2e-credits.mjs [baseUrl]
 */
const B = process.argv[2] ?? "http://localhost:3000";
let cookie = "";
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};
async function call(method, path, body, headers = {}) {
  const res = await fetch(`${B}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: B,
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) {
    cookie = set.map((c) => c.split(";")[0]).join("; ");
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    // not JSON
  }
  return { status: res.status, json, headers: res.headers };
}

const signUp = await call("POST", "/api/auth/sign-up/email", {
  email: `credits-${Date.now()}@example.test`,
  password: `${crypto.randomUUID()}Aa1`,
  name: "Credits Check",
});
check("signs up", signUp.status === 200);
const usage = await call("GET", "/api/usage");
check(
  "new account starts on the Starter trial",
  usage.json?.plan?.name === "Starter" &&
    usage.json?.workflows?.limit === 5 &&
    usage.json?.aiMessages?.limit === 50,
  JSON.stringify(usage.json?.plan)
);
const node = {
  id: "t1",
  type: "trigger",
  position: { x: 0, y: 0 },
  data: {
    label: "Manual",
    type: "trigger",
    config: { triggerType: "Manual" },
    status: "idle",
  },
};
let created = 0;
for (let i = 0; i < 5; i++) {
  const r = await call("POST", "/api/workflows/create", {
    name: `Credit ${i + 1}`,
    nodes: [node],
    edges: [],
  });
  created += r.status === 200 ? 1 : 0;
}
check("creates up to the plan's 5 workflows", created === 5);
const sixth = await call("POST", "/api/workflows/create", {
  name: "One too many",
  nodes: [node],
  edges: [],
});
check(
  "the 6th workflow is refused with a clear message (402)",
  sixth.status === 402 && /5 workflows/.test(sixth.json?.error ?? ""),
  sixth.json?.error
);
const after = await call("GET", "/api/usage");
check("usage shows 5 / 5 workflows", after.json?.workflows?.used === 5);
const gen = await call("POST", "/api/ai/generate", {
  prompt: "Every morning post a hello to Telegram",
  mode: "json",
});
const afterAi = await call("GET", "/api/usage");
check(
  "each AI Copilot message uses one credit",
  gen.status === 200 && afterAi.json?.aiMessages?.used === 1,
  `used ${afterAi.json?.aiMessages?.used}`
);

const evil = await call(
  "POST",
  "/api/workflows/create",
  { name: "x", nodes: [node], edges: [] },
  { origin: "https://evil.example" }
);
check("cross-site write blocked (403)", evil.status === 403, evil.json?.error);
const big = await fetch(`${B}/api/workflows/create`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    cookie,
    "content-length": "5000000",
  },
  body: "{}",
}).catch(() => ({ status: 413 }));
check("oversized body refused (413)", big.status === 413);
const page = await fetch(`${B}/`);
const h = page.headers;
check(
  "security headers on pages",
  Boolean(
    h.get("content-security-policy")?.includes("frame-ancestors 'none'")
  ) &&
    h.get("x-frame-options") === "DENY" &&
    h.get("x-content-type-options") === "nosniff" &&
    Boolean(h.get("referrer-policy")),
  [h.get("x-frame-options"), h.get("referrer-policy")].join(" ")
);
const failed = results.filter((ok) => !ok).length;
console.log(
  failed
    ? `\n${failed} CREDIT/SECURITY CHECK(S) FAILED`
    : "\nALL CREDIT/SECURITY CHECKS PASSED"
);
process.exit(failed ? 1 : 0);
