/**
 * End-to-end Proof-of-Execution check (docs/08) against a running N-Flow
 * wired to a chain (local Hardhat node or Amoy). Local dev only; creates a
 * throwaway *.example.test account (random password, never printed).
 *
 * Usage (from apps/web): npx tsx scripts/e2e-ledger.ts [baseUrl]
 */
import { randomBytes } from "node:crypto";
import {
  anchorAbi,
  checkChain,
  checkInclusion,
  checkReceiptHash,
  checkStepData,
  type ReceiptV1,
  type StepData,
} from "@flowledger/ledger";
import { createPublicClient, type Hex, http } from "viem";

const BASE = process.argv[2] ?? "http://localhost:3000";
if (!["localhost", "127.0.0.1", "::1"].includes(new URL(BASE).hostname)) {
  console.error("Refusing to run against a non-local host");
  process.exit(2);
}

let failures = 0;
function check(name: string, condition: unknown, detail = "") {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` (${detail})` : ""}`);
  }
}

const jar = new Map<string, string>();
async function call(
  method: string,
  path: string,
  body?: unknown,
  cookies = true
) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Origin: BASE,
      "Content-Type": "application/json",
      ...(cookies && jar.size
        ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  if (cookies) {
    for (const cookie of res.headers.getSetCookie()) {
      const [pair = ""] = cookie.split(";");
      const idx = pair.indexOf("=");
      jar.set(pair.slice(0, idx), pair.slice(idx + 1));
    }
  }
  const text = await res.text();
  // biome-ignore lint/suspicious/noExplicitAny: test client reads arbitrary JSON responses
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // HTML
  }
  return { status: res.status, json, text };
}

type PublicReceipt = {
  receipt: ReceiptV1;
  receiptHash: Hex;
  status: string;
  proof: Hex[] | null;
  batch: {
    root: Hex;
    chainBatchId: number | null;
    contract: Hex;
    status: string;
  } | null;
  chain: { receipt: ReceiptV1; hash: Hex }[];
  tamperActive: boolean;
  publicRpcUrl: string | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(
  fn: () => Promise<T | null>,
  timeoutMs: number
): Promise<T | null> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const value = await fn();
    if (value) {
      return value;
    }
    await sleep(500);
  }
  return null;
}

const finalStatus = (id: string) =>
  waitFor(async () => {
    const s = (await call("GET", `/api/workflows/executions/${id}/status`)).json
      ?.status;
    return ["success", "error", "cancelled"].includes(s) ? (s as string) : null;
  }, 30_000);

const anchoredReceipt = (id: string) =>
  waitFor(async () => {
    const r = await call("GET", `/api/ledger/${id}`, undefined, false);
    return r.status === 200 && r.json?.status === "anchored"
      ? (r.json as PublicReceipt)
      : null;
  }, 60_000);

// biome-ignore lint/nursery/useMaxParams: compact test fixture builder
const node = (
  id: string,
  type: string,
  label: string,
  config: Record<string, unknown>,
  x: number
) => ({
  id,
  type,
  position: { x, y: 0 },
  data: { label, type, config, status: "idle" },
});
const edge = (s: string, t: string) => ({
  id: `${s}-${t}`,
  source: s,
  target: t,
  type: "animated",
});

async function main() {
  console.log(`N-Flow Proof-of-Execution e2e against ${BASE}`);
  const signup = await call("POST", "/api/auth/sign-up/email", {
    email: `ledger.${randomBytes(4).toString("hex")}@example.test`,
    password: randomBytes(18).toString("base64url"),
    name: "Ledger Test",
  });
  check("signs up", signup.status === 200, String(signup.status));

  const created = await call("POST", "/api/workflows/create", {
    name: "Registration with receipts",
    nodes: [
      node("t1", "trigger", "Form", { triggerType: "Form" }, 0),
      node(
        "a1",
        "action",
        "AI Classify",
        {
          actionType: "ai/classify",
          aiInput: "{{@t1:Form.idea}}",
          aiLabels: "AI/ML, Web, Blockchain",
        },
        250
      ),
    ],
    edges: [edge("t1", "a1")],
  });
  const wfId = created.json?.id as string;
  check("creates a workflow", created.status === 200 && wfId);
  check(
    "publishes",
    (await call("POST", `/api/workflows/${wfId}/publish`, {})).status === 200
  );

  const submit = (name: string) =>
    call(
      "POST",
      `/api/forms/${wfId}`,
      {
        values: {
          name,
          email: "asha@example.test",
          college: "KITS Warangal",
          idea: "Blockchain land records",
        },
        consent: true,
        submissionId: randomBytes(12).toString("hex"),
      },
      false
    );

  const first = await submit("Asha");
  const firstId = first.json?.executionId as string;
  check(
    "form submission starts a run",
    first.status === 200 && firstId,
    JSON.stringify(first.json)
  );
  check("run succeeds", (await finalStatus(firstId)) === "success");

  const pending = await waitFor(async () => {
    const r = await call("GET", `/api/ledger/${firstId}`, undefined, false);
    return r.status === 200 ? (r.json as PublicReceipt) : null;
  }, 15_000);
  check(
    "a receipt is issued for the run",
    pending && pending.receipt.executionId === firstId
  );
  check(
    "the public receipt carries hashes, never the salt",
    pending && !JSON.stringify(pending).includes('"salt"')
  );

  const anchored = await anchoredReceipt(firstId);
  check(
    "the receipt is anchored on-chain within a minute",
    anchored?.batch?.status === "confirmed",
    JSON.stringify(anchored?.batch)
  );
  if (
    !anchored?.batch ||
    anchored.batch.chainBatchId === null ||
    !anchored.proof ||
    !anchored.publicRpcUrl
  ) {
    throw new Error("Cannot continue without an anchored receipt");
  }

  // The same checks the browser runs.
  check(
    "layer 0: receipt hash recomputes",
    checkReceiptHash(anchored.receipt, anchored.receiptHash).ok
  );
  check(
    "layer 1: Merkle inclusion",
    checkInclusion(anchored.batch.root, anchored.receiptHash, anchored.proof).ok
  );
  const client = createPublicClient({ transport: http(anchored.publicRpcUrl) });
  const onChain = (await client.readContract({
    address: anchored.batch.contract,
    abi: anchorAbi,
    functionName: "batch",
    args: [BigInt(anchored.batch.chainBatchId)],
  })) as { root: Hex };
  check(
    "layer 2: on-chain root matches",
    onChain.root.toLowerCase() === anchored.batch.root.toLowerCase()
  );
  const contractSays = await client.readContract({
    address: anchored.batch.contract,
    abi: anchorAbi,
    functionName: "verifyReceipt",
    args: [
      BigInt(anchored.batch.chainBatchId),
      anchored.receiptHash,
      anchored.proof,
    ],
  });
  check(
    "layer 2: the contract's verifyReceipt() confirms it",
    contractSays === true
  );

  const integrity = await call("GET", `/api/ledger/${firstId}/integrity`);
  const data = integrity.json as { salt: Hex; steps: StepData[] };
  check(
    "layer 3: owner gets the salt and step data",
    integrity.status === 200 && data.salt && data.steps.length === 2
  );
  check(
    "layer 3: stored data matches the receipt",
    checkStepData(anchored.receipt, data.salt, data.steps).ok
  );
  check(
    "a stranger cannot read the integrity data",
    (await call("GET", `/api/ledger/${firstId}/integrity`, undefined, false))
      .status === 401
  );

  // Tamper simulator.
  const tamper = await call("POST", `/api/ledger/${firstId}/tamper`);
  check(
    "tamper simulator edits a stored step",
    tamper.status === 200 && tamper.json?.nodeId,
    JSON.stringify(tamper.json)
  );
  const afterTamper = (await call("GET", `/api/ledger/${firstId}/integrity`))
    .json as { salt: Hex; steps: StepData[] };
  const caught = checkStepData(
    anchored.receipt,
    afterTamper.salt,
    afterTamper.steps
  );
  check(
    "layer 3 catches the edit and names the step",
    !caught.ok && caught.failedStep?.nodeId === tamper.json?.nodeId,
    caught.detail
  );
  check(
    "layers 0–2 still pass (the original is safe on-chain)",
    checkReceiptHash(anchored.receipt, anchored.receiptHash).ok
  );
  check(
    "the public page flags the simulation",
    (await call("GET", `/api/ledger/${firstId}`, undefined, false)).json
      ?.tamperActive === true
  );
  check(
    "restore reverts it",
    (await call("DELETE", `/api/ledger/${firstId}/tamper`)).json?.restored === 1
  );
  const restored = (await call("GET", `/api/ledger/${firstId}/integrity`))
    .json as { salt: Hex; steps: StepData[] };
  check(
    "layer 3 passes again after restore",
    checkStepData(anchored.receipt, restored.salt, restored.steps).ok
  );

  // Hash chain across runs.
  const second = await submit("Ravi");
  const secondId = second.json?.executionId as string;
  await finalStatus(secondId);
  const secondReceipt = await anchoredReceipt(secondId);
  check(
    "the next receipt links to the previous one",
    secondReceipt?.receipt.prev === anchored.receiptHash
  );
  check(
    "layer 4: chain continuity",
    secondReceipt &&
      checkChain(secondReceipt.chain).ok &&
      secondReceipt.chain.length >= 2
  );

  const page = await call("GET", `/verify/${secondId}`, undefined, false);
  check(
    "the public verify page renders for anyone",
    page.status === 200 && page.text.includes("Proof of Execution")
  );
  check(
    "unknown runs 404",
    (await call("GET", "/verify/doesnotexist0000", undefined, false)).status ===
      404
  );

  console.log(
    failures === 0
      ? "\nALL LEDGER CHECKS PASSED"
      : `\n${failures} CHECK(S) FAILED`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
