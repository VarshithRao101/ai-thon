/**
 * "Only the first N submissions" builds a native counter flow (no made-up
 * HTTP step), and live form submissions carry submissionNumber 1, 2, 3…
 *   node scripts/e2e-first-n.mjs [baseUrl]
 */
const B = process.argv[2] ?? "http://localhost:3000";
let cookie = "";
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};
async function call(method, path, body, auth = true) {
  const res = await fetch(`${B}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: B,
      ...(cookie && auth ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length && auth) {
    cookie = set.map((c) => c.split(";")[0]).join("; ");
  }
  return { status: res.status, json: await res.json().catch(() => null) };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await call("POST", "/api/auth/sign-up/email", {
  email: `firstn-${Date.now()}@example.test`,
  password: `${crypto.randomUUID()}Aa1`,
  name: "First N",
});

const PROMPTS = [
  "When participants submit the form, send a thank-you email only to the first 5 submissions, and alert our Telegram group if it fails",
  "Give a discount code by email to the first 3 people who fill our form",
];
let built = null;
for (const prompt of PROMPTS) {
  const r = await call("POST", "/api/ai/generate", { prompt, mode: "json" });
  const nodes = r.json?.nodes ?? [];
  const http = nodes.filter(
    (n) => n.data?.config?.actionType === "HTTP Request"
  );
  const cond = nodes.find((n) => n.data?.config?.actionType === "Condition");
  const expr = String(cond?.data?.config?.condition ?? "");
  check(
    `"${prompt.slice(0, 50)}…" uses the built-in counter`,
    http.length === 0 && expr.includes("submissionNumber"),
    `${r.json?.source}/${r.json?.model} · condition: ${expr} · http steps: ${http.length}`
  );
  built ??= r.json;
}

// Save + publish that workflow, then submit its form 3 times.
const nodes = built.nodes;
const created = await call("POST", "/api/workflows/create", {
  name: built.name,
  nodes,
  edges: built.edges,
});
const id = created.json?.id;
const pub = await call("POST", `/api/workflows/${id}/publish`, {});
check(
  "workflow saved and published",
  Boolean(id) && pub.status < 300,
  `${pub.status}`
);
const form = nodes.find((n) => n.data?.type === "trigger")?.data?.config ?? {};
const fields = JSON.parse(String(form.formFields ?? form.formSchema ?? "[]"));
const values = {};
const sample = (f) => {
  if (f.type === "email") {
    return "first.n@example.test";
  }
  if (f.type === "number") {
    return 1;
  }
  return f.options?.[0]?.value ?? f.options?.[0] ?? "Test";
};
for (const f of Array.isArray(fields) ? fields : (fields.fields ?? [])) {
  values[f.key] = sample(f);
}
for (let i = 0; i < 3; i++) {
  await call("POST", `/api/forms/${id}`, { values, consent: true }, false);
}
await sleep(4000);
const runs = await call("GET", `/api/workflows/${id}/executions`);
const numbers = (runs.json ?? [])
  .map((r) => r.input?.submissionNumber)
  .filter((n) => n !== undefined)
  .sort();
check(
  "form submissions are numbered 1, 2, 3",
  JSON.stringify(numbers) === "[1,2,3]",
  JSON.stringify(numbers)
);

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
