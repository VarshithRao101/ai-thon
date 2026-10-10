"use client";

import {
  anchorAbi,
  type CheckResult,
  checkAnchor,
  checkChain,
  checkInclusion,
  checkReceiptHash,
  checkStepData,
  receiptHash,
  type StepData,
} from "@flowledger/ledger";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Hourglass,
  Loader2,
  RotateCcw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPublicClient, type Hex, http } from "viem";
import { Button } from "@/components/ui/button";
import type { PublicReceipt } from "@/lib/ledger/public";
import { cn } from "@/lib/utils";

type CheckState = "waiting" | "running" | "ok" | "fail" | "skipped";
type Outcome = CheckResult & { skipped?: boolean };
type Check = {
  key: string;
  title: string;
  how: string;
  state: CheckState;
  detail?: string;
};

const INITIAL: Check[] = [
  {
    key: "hash",
    title: "Receipt fingerprint",
    how: "Re-hashed in your browser (RFC 8785 JSON, keccak-256)",
    state: "waiting",
  },
  {
    key: "merkle",
    title: "Included in a batch",
    how: "Merkle proof checked against the batch root",
    state: "waiting",
  },
  {
    key: "chain",
    title: "Anchored on-chain",
    how: "Your browser reads the smart contract directly",
    state: "waiting",
  },
  {
    key: "data",
    title: "Run data unchanged",
    how: "Owner only: stored step data re-hashed with its salt",
    state: "waiting",
  },
  {
    key: "continuity",
    title: "No runs missing",
    how: "Each receipt links to the one before it",
    state: "waiting",
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const short = (hex: string, n = 10) =>
  hex.length > n * 2 ? `${hex.slice(0, n)}…${hex.slice(-6)}` : hex;

function StateIcon({ state }: { state: CheckState }) {
  if (state === "running") {
    return <Loader2 className="size-5 animate-spin text-primary" />;
  }
  if (state === "ok") {
    return <CheckCircle2 className="size-5 text-success" />;
  }
  if (state === "fail") {
    return <XCircle className="size-5 text-destructive" />;
  }
  if (state === "skipped") {
    return <CircleDashed className="size-5 text-muted-foreground" />;
  }
  return <CircleDashed className="size-5 text-muted-foreground/40" />;
}

async function readOnChain(data: PublicReceipt): Promise<CheckResult> {
  const batch = data.batch;
  if (
    !(batch && batch.chainBatchId !== null && data.proof && data.publicRpcUrl)
  ) {
    return { ok: false, detail: "Not anchored yet" };
  }
  const client = createPublicClient({
    transport: http(data.publicRpcUrl, { timeout: 15_000 }),
  });
  const onChain = (await client.readContract({
    address: batch.contract,
    abi: anchorAbi,
    functionName: "batch",
    args: [BigInt(batch.chainBatchId)],
  })) as { root: Hex; anchoredAt: bigint; leafCount: number };
  const rootCheck = checkAnchor(batch.root, onChain.root);
  if (!rootCheck.ok) {
    return rootCheck;
  }
  const verified = (await client.readContract({
    address: batch.contract,
    abi: anchorAbi,
    functionName: "verifyReceipt",
    args: [BigInt(batch.chainBatchId), data.receiptHash, data.proof],
  })) as boolean;
  const when = new Date(Number(onChain.anchoredAt) * 1000).toLocaleString(
    "en-IN",
    { timeZone: "Asia/Kolkata" }
  );
  return verified
    ? {
        ok: true,
        detail: `The contract itself confirms this receipt: batch #${batch.chainBatchId}, ${when} IST`,
      }
    : { ok: false, detail: "The contract rejected this receipt's proof" };
}

function stateOf(result: Outcome): CheckState {
  if (result.skipped) {
    return "skipped";
  }
  return result.ok ? "ok" : "fail";
}

function headline(done: boolean, failed: boolean): string {
  if (!done) {
    return "Verifying…";
  }
  return failed ? "Verification failed" : "Verified";
}

function anchorLabel(anchored: boolean, chainId: number | undefined): string {
  if (!anchored) {
    return "Pending anchor";
  }
  return chainId === 80_002
    ? "Anchored on Polygon Amoy"
    : `Anchored on chain ${chainId}`;
}

function checkMerkle(current: PublicReceipt): Promise<Outcome> {
  if (!(current.batch && current.proof)) {
    return Promise.resolve({
      ok: false,
      detail: "Waiting for the next batch (every 30 s in demo mode)",
    });
  }
  return Promise.resolve(
    checkInclusion(current.batch.root, current.receiptHash, current.proof)
  );
}

function checkContinuity(current: PublicReceipt): Promise<Outcome> {
  const broken = current.chain.some(
    (link) => receiptHash(link.receipt) !== link.hash
  );
  return Promise.resolve(
    broken
      ? { ok: false, detail: "A receipt in the chain does not match its hash" }
      : checkChain(current.chain)
  );
}

type OwnerData = { salt: Hex; steps: StepData[] };

/** Layer 3: only the workflow's workspace may read the salt and step data. */
async function checkOwnerData(
  current: PublicReceipt,
  onOwner: (data: OwnerData | null) => void,
  onTampered: (nodeId: string) => void
): Promise<Outcome> {
  const response = await fetch(`/api/ledger/${current.executionId}/integrity`, {
    cache: "no-store",
  });
  if (!response.ok) {
    onOwner(null);
    return {
      ok: true,
      skipped: true,
      detail: "Sign in as the workflow owner to run this check",
    };
  }
  const body = (await response.json()) as OwnerData;
  onOwner(body);
  const result = checkStepData(current.receipt, body.salt, body.steps);
  if (!result.ok && result.failedStep) {
    onTampered(result.failedStep.nodeId);
  }
  return result;
}

export function VerifyRun({ initial }: { initial: PublicReceipt }) {
  const [data, setData] = useState(initial);
  const [checks, setChecks] = useState<Check[]>(INITIAL);
  const [owner, setOwner] = useState<{ salt: Hex; steps: StepData[] } | null>(
    null
  );
  const [tamperedStep, setTamperedStep] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const runId = useRef(0);

  const set = useCallback(
    (key: string, patch: Partial<Check>) =>
      setChecks((prev) =>
        prev.map((c) => (c.key === key ? { ...c, ...patch } : c))
      ),
    []
  );

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/ledger/${initial.executionId}`, {
      cache: "no-store",
    });
    if (response.ok) {
      const next = (await response.json()) as PublicReceipt;
      setData(next);
      return next;
    }
    return null;
  }, [initial.executionId]);

  const runChecks = useCallback(
    async (current: PublicReceipt) => {
      runId.current += 1;
      const id = runId.current;
      const live = () => id === runId.current;
      setChecks(INITIAL.map((c) => ({ ...c })));
      setTamperedStep(null);
      const step = async (key: string, fn: () => Promise<Outcome>) => {
        if (!live()) {
          return;
        }
        set(key, { state: "running" });
        await sleep(450);
        try {
          const result = await fn();
          if (live()) {
            set(key, { state: stateOf(result), detail: result.detail });
          }
        } catch (error) {
          set(key, {
            state: "fail",
            detail:
              error instanceof Error
                ? error.message.split("\n")[0]
                : "Check failed",
          });
        }
      };

      await step("hash", () =>
        Promise.resolve(checkReceiptHash(current.receipt, current.receiptHash))
      );
      await step("merkle", () => checkMerkle(current));
      await step("chain", () => readOnChain(current));
      await step("data", () =>
        checkOwnerData(current, setOwner, setTamperedStep)
      );
      await step("continuity", () => checkContinuity(current));
    },
    [set]
  );

  useEffect(() => {
    runChecks(initial).catch(() => undefined);
  }, [initial, runChecks]);

  // Until anchored, poll and re-verify once the batch lands.
  useEffect(() => {
    if (data.status === "anchored") {
      return;
    }
    const timer = setInterval(async () => {
      const next = await refresh();
      if (next?.status === "anchored") {
        clearInterval(timer);
        await runChecks(next);
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [data.status, refresh, runChecks]);

  const tamper = async (restore: boolean) => {
    setBusy(true);
    try {
      await fetch(`/api/ledger/${data.executionId}/tamper`, {
        method: restore ? "DELETE" : "POST",
      });
      const next = (await refresh()) ?? data;
      await runChecks(next);
    } finally {
      setBusy(false);
    }
  };

  const failed = checks.some((c) => c.state === "fail");
  const done = checks.every(
    (c) => c.state !== "waiting" && c.state !== "running"
  );
  const anchored =
    data.status === "anchored" && data.batch?.status === "confirmed";

  return (
    <div className="space-y-6">
      {data.tamperActive && (
        <output className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <p>
            <span className="font-semibold">Tamper simulation active.</span> A
            workspace admin edited this run's stored data on purpose, for a
            demo. The edit is on the record and can be restored.
          </p>
        </output>
      )}

      <div
        className={cn(
          "honeycomb-glow rounded-2xl border bg-card p-5 sm:p-6",
          done && !failed && "border-success/40",
          done && failed && "border-destructive/50"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
              Run {short(data.executionId, 8)}
            </p>
            <h2 className="font-display font-semibold text-xl">
              {headline(done, failed)}
            </h2>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium text-xs",
              anchored
                ? "border-success/40 text-success"
                : "border-primary/40 text-primary"
            )}
          >
            {anchored ? (
              <CheckCircle2 className="size-3.5" />
            ) : (
              <Hourglass className="size-3.5" />
            )}
            {anchorLabel(anchored, data.batch?.chainId)}
          </span>
        </div>

        <ol className="mt-5 space-y-3">
          {checks.map((check, index) => (
            <li
              className="flex gap-3 rounded-lg border bg-background/40 p-3"
              key={check.key}
            >
              <StateIcon state={check.state} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">
                  {index + 1}. {check.title}
                </p>
                <p className="text-muted-foreground text-xs">
                  {check.detail ?? check.how}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {data.batch?.txUrl && (
          <a
            className="mt-4 inline-flex items-center gap-1.5 text-primary text-sm underline-offset-4 hover:underline"
            href={data.batch.txUrl}
            rel="noopener"
            target="_blank"
          >
            View the anchoring transaction on Polygonscan{" "}
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>

      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <h3 className="font-display font-semibold">
          What this receipt commits to
        </h3>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs">Run status</dt>
            <dd className="font-medium capitalize">{data.receipt.status}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Trigger</dt>
            <dd className="font-medium capitalize">{data.receipt.trigger}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Completed</dt>
            <dd>
              {new Date(data.receipt.completedAt).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
              })}{" "}
              IST
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Receipt hash</dt>
            <dd className="font-mono text-xs" title={data.receiptHash}>
              {short(data.receiptHash, 14)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">
              Workflow version hash
            </dt>
            <dd className="font-mono text-xs" title={data.receipt.versionHash}>
              {short(data.receipt.versionHash, 14)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Previous receipt</dt>
            <dd className="font-mono text-xs">
              {data.receipt.prev
                ? short(data.receipt.prev, 14)
                : "First in this workspace"}
            </dd>
          </div>
        </dl>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="text-muted-foreground text-xs">
              <tr>
                <th className="py-2 pr-3 font-normal">Step</th>
                <th className="py-2 pr-3 font-normal">Status</th>
                <th className="py-2 pr-3 font-normal">Attempt</th>
                <th className="py-2 font-normal">Output hash (salted)</th>
              </tr>
            </thead>
            <tbody>
              {data.receipt.steps.map((s) => (
                <tr
                  className={cn(
                    "border-t",
                    tamperedStep === s.nodeId &&
                      "bg-destructive/10 text-destructive"
                  )}
                  key={s.nodeId}
                >
                  <td className="py-2 pr-3">
                    {tamperedStep === s.nodeId && (
                      <AlertTriangle className="mr-1 inline size-3.5" />
                    )}
                    {s.action}
                  </td>
                  <td className="py-2 pr-3 capitalize">{s.status}</td>
                  <td className="py-2 pr-3">{s.attempt}</td>
                  <td className="py-2 font-mono text-xs">
                    {short(s.outputHash, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-muted-foreground text-xs">
          Only hashes are public. Step data stays private in the owner's
          workspace, and only a 32-byte Merkle root goes on-chain.
        </p>
      </section>

      {owner && (
        <section className="rounded-2xl border border-dashed p-5">
          <h3 className="font-display font-semibold">
            Owner tools: tamper simulator
          </h3>
          <p className="mt-1 text-muted-foreground text-sm">
            Edit one stored step output silently, as an insider with database
            access could. Check 4 should catch it and name the step. Every
            simulated edit is recorded.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() => tamper(false)}
              variant="destructive"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldAlert className="size-4" />
              )}
              Simulate tamper
            </Button>
            <Button
              disabled={busy}
              onClick={() => tamper(true)}
              variant="outline"
            >
              <RotateCcw className="size-4" />
              Restore
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
