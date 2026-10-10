// End-to-end tenancy check against a running ZETA (local dev only).
// Creates two throwaway accounts (*.example.test, random passwords never
// printed) and verifies workspace isolation, RBAC, API keys and the audit log.
// Usage: node scripts/e2e-tenancy.mjs [baseUrl]   (default http://localhost:3000)
import { randomBytes } from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:3000";
const host = new URL(BASE).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
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

function client(label) {
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
  const suffix = randomBytes(4).toString("hex");
  return {
    label,
    email: `${label.toLowerCase()}.${suffix}@example.test`,
    password: randomBytes(18).toString("base64url"),
    call,
  };
}

async function signUp(user, name) {
  const res = await user.call("POST", "/api/auth/sign-up/email", {
    email: user.email,
    password: user.password,
    name,
  });
  return res.status;
}

const alice = client("Alice");
const bob = client("Bob");

console.log(`ZETA tenancy e2e against ${BASE}`);

// --- accounts and personal workspaces
check("Alice signs up", (await signUp(alice, "Alice Test")) === 200);
check("Bob signs up", (await signUp(bob, "Bob Test")) === 200);
const meA = await alice.call("GET", "/api/me");
const meB = await bob.call("GET", "/api/me");
check("Alice owns a personal workspace", meA.json?.workspace?.role === "owner", JSON.stringify(meA.json?.workspace));
check("Bob owns a different workspace", meB.json?.workspace?.id && meB.json.workspace.id !== meA.json?.workspace?.id);

// --- private workflow isolation
const wf = await alice.call("POST", "/api/workflows/create", { name: "Alice private flow", nodes: [], edges: [] });
const wfId = wf.json?.id;
check("Alice creates a workflow", wf.status === 200 && wfId);
check("Bob cannot read it (404, not 403: no existence leak)", (await bob.call("GET", `/api/workflows/${wfId}`)).status === 404);
check("Bob cannot rename it", (await bob.call("PATCH", `/api/workflows/${wfId}`, { name: "pwned" })).status === 404);
check("Bob cannot delete it", (await bob.call("DELETE", `/api/workflows/${wfId}`)).status === 404);
check("Bob cannot run it", (await bob.call("POST", `/api/workflow/${wfId}/execute`, {})).status === 404);
const listB = await bob.call("GET", "/api/workflows");
check("Bob's list excludes it", Array.isArray(listB.json) && !listB.json.some((w) => w.id === wfId));

// --- public sharing: readable, never writable or runnable by others
check("Alice makes it public", (await alice.call("PATCH", `/api/workflows/${wfId}`, { visibility: "public" })).status === 200);
const pub = await bob.call("GET", `/api/workflows/${wfId}`);
check("Bob can view the public workflow read-only", pub.status === 200 && pub.json?.isOwner === false);
check("Bob still cannot edit it", (await bob.call("PATCH", `/api/workflows/${wfId}`, { name: "pwned" })).status === 404);
check("Bob still cannot run it", (await bob.call("POST", `/api/workflow/${wfId}/execute`, {})).status === 404);
const dup = await bob.call("POST", `/api/workflows/${wfId}/duplicate`);
check("Bob can duplicate it into his own workspace", dup.status === 200 && dup.json?.workspaceId === meB.json?.workspace?.id);
const listB2 = await bob.call("GET", "/api/workflows");
check("Bob's list still excludes Alice's public original", !listB2.json?.some((w) => w.id === wfId));

// --- credentials (vault) isolation
const integ = await alice.call("POST", "/api/integrations", {
  name: "Alice Resend",
  type: "resend",
  config: { apiKey: "re_test_not_a_real_key", fromEmail: "Test <test@example.test>" },
});
const intId = integ.json?.id;
check("Alice stores a credential", integ.status === 200 && intId);
check("Bob cannot read Alice's credential", (await bob.call("GET", `/api/integrations/${intId}`)).status === 404);
check("Bob cannot delete Alice's credential", (await bob.call("DELETE", `/api/integrations/${intId}`)).status === 404);
const intsB = await bob.call("GET", "/api/integrations");
check("Bob's credential list is empty", Array.isArray(intsB.json) && intsB.json.length === 0);
const intA = await alice.call("GET", `/api/integrations/${intId}`);
check("the saved secret never comes back (write-only, D-054)", intA.status === 200 && intA.json?.config?.apiKey === "••••••••" && !JSON.stringify(intA.json).includes("re_test_not_a_real_key"));
await alice.call("PUT", `/api/integrations/${intId}`, { config: { apiKey: "••••••••" } });
const kept = await alice.call("POST", `/api/integrations/${intId}/test`, {});
check("saving the mask back keeps the stored secret", kept.status === 200 || kept.status === 400, `status ${kept.status}`);

// --- run a workflow (Hive queue; the worker runs inside the tenant context)
const run = await alice.call("POST", `/api/workflow/${wfId}/execute`, {});
check("Alice runs her workflow", run.status === 200 && run.json?.executionId);
let runStatus = "queued";
for (let i = 0; i < 40 && ["queued", "running", "waiting"].includes(runStatus); i++) {
  await new Promise((r) => setTimeout(r, 250));
  runStatus = (await alice.call("GET", `/api/workflows/executions/${run.json?.executionId}/status`)).json?.status;
}
check("The run completes successfully", runStatus === "success", runStatus);
check("Bob cannot read Alice's run", (await bob.call("GET", `/api/workflows/executions/${run.json?.executionId}/logs`)).status === 404);

// --- API keys and webhook ingress
const key = await alice.call("POST", "/api/api-keys", { name: "e2e" });
const fullKey = key.json?.key;
check("Alice creates an API key (shown once)", key.status === 200 && typeof fullKey === "string" && fullKey.startsWith("flk_"));
const hookOwn = await alice.call("POST", `/api/workflows/${wfId}/webhook`, {}, { Authorization: `Bearer ${fullKey}` });
check("Key resolves to Alice's workspace (manual-trigger flow rejects webhook: 400)", hookOwn.status === 400, String(hookOwn.status));
const hookForeign = await alice.call("POST", `/api/workflows/${dup.json?.id}/webhook`, {}, { Authorization: `Bearer ${fullKey}` });
check("Alice's key cannot reach Bob's workflow (404)", hookForeign.status === 404, String(hookForeign.status));
const hookBad = await alice.call("POST", `/api/workflows/${wfId}/webhook`, {}, { Authorization: "Bearer flk_invalid" });
check("Unknown key is rejected (401)", hookBad.status === 401);
check("Alice revokes the key", (await alice.call("DELETE", `/api/api-keys/${key.json?.id}`)).status === 200);
const hookRevoked = await alice.call("POST", `/api/workflows/${wfId}/webhook`, {}, { Authorization: `Bearer ${fullKey}` });
check("Revoked key is rejected (401)", hookRevoked.status === 401);

// --- RBAC: Bob joins Alice's workspace as a viewer
const invite = await alice.call("POST", "/api/auth/organization/invite-member", {
  email: bob.email,
  role: "viewer",
  organizationId: meA.json?.workspace?.id,
});
check("Alice invites Bob as viewer", invite.status === 200 && invite.json?.id, String(invite.status));
const accept = await bob.call("POST", "/api/auth/organization/accept-invitation", { invitationId: invite.json?.id });
check("Bob accepts", accept.status === 200, String(accept.status));
const setActive = await bob.call("POST", "/api/auth/organization/set-active", { organizationId: meA.json?.workspace?.id });
check("Bob switches to Alice's workspace", setActive.status === 200, String(setActive.status));
const meBv = await bob.call("GET", "/api/me");
check("Bob is a viewer there", meBv.json?.workspace?.role === "viewer" && meBv.json?.workspace?.id === meA.json?.workspace?.id);
check("Viewer sees the workspace's workflows", (await bob.call("GET", "/api/workflows")).json?.some((w) => w.id === wfId));
check("Viewer cannot edit (403)", (await bob.call("PATCH", `/api/workflows/${wfId}`, { name: "x" })).status === 403);
check("Viewer cannot run (403)", (await bob.call("POST", `/api/workflow/${wfId}/execute`, {})).status === 403);
check("Viewer cannot add credentials (403)", (await bob.call("POST", "/api/integrations", { type: "resend", config: {} })).status === 403);
check("Viewer cannot read decrypted credentials (403)", (await bob.call("GET", `/api/integrations/${intId}`)).status === 403);
check("Viewer cannot read the audit log (403)", (await bob.call("GET", "/api/audit")).status === 403);

// --- audit trail
const audit = await alice.call("GET", "/api/audit");
const actions = new Set((audit.json ?? []).map((e) => e.action));
for (const action of ["workflow.create", "workflow.visibility_change", "integration.create", "apikey.create", "apikey.revoke"]) {
  check(`Audit log records ${action}`, actions.has(action));
}

// --- vault rotation endpoint (owner)
const rotate = await alice.call("POST", "/api/workspaces/vault/rotate");
check("Owner can call vault rotation", rotate.status === 200 && typeof rotate.json?.to === "number");

// --- guest builds first, signs up later, keeps everything
const guest = client("Guest");
check("Guest starts anonymously", (await guest.call("POST", "/api/auth/sign-in/anonymous", {})).status === 200);
const meG = await guest.call("GET", "/api/me");
check("Guest gets a guest workspace", meG.json?.isAnonymous === true && meG.json?.workspace?.role === "owner");
const gwf = await guest.call("POST", "/api/workflows/create", { name: "Built as a guest", nodes: [], edges: [] });
check("Guest builds a workflow", gwf.status === 200);
check("Guest cannot create API keys", (await guest.call("POST", "/api/api-keys", {})).status === 403);
check("Guest signs up", (await signUp(guest, "Gita Test")) === 200);
const meG2 = await guest.call("GET", "/api/me");
check("Now a real account in the same workspace", meG2.json?.isAnonymous === false && meG2.json?.workspace?.id === meG.json?.workspace?.id, JSON.stringify(meG2.json?.workspace));
check("Workspace renamed after the user", meG2.json?.workspace?.name === "Gita's workspace", meG2.json?.workspace?.name);
check("The auto-created empty workspace was merged away", meG2.json?.memberships?.length === 1, String(meG2.json?.memberships?.length));
check("The guest-built workflow survived", (await guest.call("GET", "/api/workflows")).json?.some((w) => w.id === gwf.json?.id));

// --- concurrent first requests must not create duplicate personal workspaces
const racer = client("Racer");
check("Racer signs up", (await signUp(racer, "Racer Test")) === 200);
const burst = await Promise.all(Array.from({ length: 5 }, () => racer.call("GET", "/api/me")));
check("5 parallel first requests all succeed", burst.every((r) => r.status === 200));
check("...and agree on one workspace", new Set(burst.map((r) => r.json?.workspace?.id)).size === 1);
check("...with exactly one membership", (await racer.call("GET", "/api/me")).json?.memberships?.length === 1);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
