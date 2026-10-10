import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "./breaker";
import { runGraph, toCheckpoint } from "./run";
import type { EngineEdge, EngineNode, ExecuteNodeArgs, NodeOutcome } from "./types";

const trigger = (id = "t"): EngineNode => ({ id, kind: "trigger", label: id, enabled: true });
const action = (id: string, extra: Partial<EngineNode> = {}): EngineNode => ({
  id,
  kind: "action",
  label: id,
  enabled: true,
  ...extra,
});
const edge = (source: string, target: string, sourceHandle?: string): EngineEdge => ({
  id: `${source}->${target}${sourceHandle ? `:${sourceHandle}` : ""}`,
  source,
  target,
  sourceHandle,
});
const ok = (output: unknown = null, branch?: string): NodeOutcome => ({ status: "success", output, branch });
const fail = (cls: "retryable" | "validation" | "fatal" | "auth" = "fatal", message = "boom"): NodeOutcome => ({
  status: "error",
  error: { message, class: cls },
});
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Script = Record<string, (args: ExecuteNodeArgs) => Promise<NodeOutcome> | NodeOutcome>;

function harness(script: Script = {}) {
  const calls: { id: string; attempt: number }[] = [];
  const seen: Record<string, Record<string, unknown>> = {};
  let active = 0;
  let peak = 0;
  const executeNode = async (args: ExecuteNodeArgs): Promise<NodeOutcome> => {
    calls.push({ id: args.node.id, attempt: args.attempt });
    seen[args.node.id] = { ...args.outputs };
    active += 1;
    peak = Math.max(peak, active);
    try {
      const fn = script[args.node.id];
      return fn ? await fn(args) : ok({ from: args.node.id });
    } finally {
      active -= 1;
    }
  };
  return { calls, seen, executeNode, peak: () => peak, ids: () => calls.map((c) => c.id) };
}

const noSleep = { sleep: () => Promise.resolve(), random: () => 0 };

describe("runGraph: scheduling", () => {
  it("runs a linear chain in order and passes outputs downstream", async () => {
    const h = harness();
    const result = await runGraph({
      graph: { nodes: [trigger(), action("a"), action("b")], edges: [edge("t", "a"), edge("a", "b")] },
      executeNode: h.executeNode,
      executionKey: "ex1",
    });
    expect(result.status).toBe("success");
    expect(h.ids()).toEqual(["t", "a", "b"]);
    expect(h.seen.b).toEqual({ t: { from: "t" }, a: { from: "a" } });
  });

  it("fans out in parallel within the concurrency cap", async () => {
    const slow = () => tick(20).then(() => ok());
    const h = harness({ a: slow, b: slow, c: slow });
    const result = await runGraph({
      graph: {
        nodes: [trigger(), action("a"), action("b"), action("c")],
        edges: [edge("t", "a"), edge("t", "b"), edge("t", "c")],
      },
      executeNode: h.executeNode,
      executionKey: "ex",
      maxParallel: 2,
    });
    expect(result.status).toBe("success");
    expect(h.peak()).toBe(2);
  });

  it("runs a join only after ALL parents finish (fixes the base template's diamond race)", async () => {
    const h = harness({ a: () => tick(30).then(() => ok("A")), b: () => ok("B") });
    await runGraph({
      graph: {
        nodes: [trigger(), action("a"), action("b"), action("j")],
        edges: [edge("t", "a"), edge("t", "b"), edge("a", "j"), edge("b", "j")],
      },
      executeNode: h.executeNode,
      executionKey: "ex",
    });
    expect(h.ids().filter((id) => id === "j")).toHaveLength(1);
    expect(h.seen.j).toMatchObject({ a: "A", b: "B" });
  });
});

describe("runGraph: branching", () => {
  const graph = {
    nodes: [trigger(), action("c"), action("x"), action("y"), action("z")],
    edges: [edge("t", "c"), edge("c", "x"), edge("c", "y", "false"), edge("x", "z")],
  };

  it("follows the default/true branch and skips the false branch", async () => {
    const h = harness({ c: () => ok({ condition: true }, "true") });
    const result = await runGraph({ graph, executeNode: h.executeNode, executionKey: "ex" });
    expect(result.status).toBe("success");
    expect(h.ids()).toEqual(["t", "c", "x", "z"]);
    expect(result.nodes.y?.status).toBe("skipped");
  });

  it("follows the false branch and propagates skips downstream", async () => {
    const h = harness({ c: () => ok({ condition: false }, "false") });
    const result = await runGraph({ graph, executeNode: h.executeNode, executionKey: "ex" });
    expect(h.ids()).toEqual(["t", "c", "y"]);
    expect(result.nodes.x?.status).toBe("skipped");
    expect(result.nodes.z?.status).toBe("skipped");
  });

  it("joins branches with OR semantics (one active input is enough)", async () => {
    const h = harness({ c: () => ok(null, "true") });
    const result = await runGraph({
      graph: {
        nodes: [trigger(), action("c"), action("x"), action("y"), action("j")],
        edges: [edge("t", "c"), edge("c", "x", "true"), edge("c", "y", "false"), edge("x", "j"), edge("y", "j")],
      },
      executeNode: h.executeNode,
      executionKey: "ex",
    });
    expect(result.nodes.j?.status).toBe("success");
    expect(result.nodes.y?.status).toBe("skipped");
  });

  it("passes control through a disabled node with a null output", async () => {
    const h = harness();
    const result = await runGraph({
      graph: {
        nodes: [trigger(), action("d", { enabled: false }), action("a")],
        edges: [edge("t", "d"), edge("d", "a")],
      },
      executeNode: h.executeNode,
      executionKey: "ex",
    });
    expect(h.ids()).toEqual(["t", "a"]);
    expect(result.nodes.d?.status).toBe("skipped");
    expect(h.seen.a).toHaveProperty("d", null);
  });

  it("never executes an action that is not connected to the trigger", async () => {
    const h = harness();
    const result = await runGraph({
      graph: { nodes: [trigger(), action("orphan")], edges: [] },
      executeNode: h.executeNode,
      executionKey: "ex",
    });
    expect(h.ids()).toEqual(["t"]);
    expect(result.nodes.orphan?.status).toBe("skipped");
  });
});

describe("runGraph: failures and retries", () => {
  it("retries retryable errors with backoff, then succeeds", async () => {
    let n = 0;
    const delays: number[] = [];
    const retries: number[] = [];
    const h = harness({ a: () => (++n < 3 ? fail("retryable") : ok("done")) });
    const result = await runGraph({
      graph: { nodes: [trigger(), action("a")], edges: [edge("t", "a")] },
      executeNode: h.executeNode,
      executionKey: "ex",
      random: () => 0.5,
      sleep: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
      hooks: { onNodeRetry: (_n, info) => void retries.push(info.attempt) },
    });
    expect(result.status).toBe("success");
    expect(h.calls.filter((c) => c.id === "a").map((c) => c.attempt)).toEqual([1, 2, 3]);
    expect(retries).toEqual([1, 2]);
    expect(delays).toEqual([500, 1000]); // full jitter with random=0.5: 0.5*1000, 0.5*2000
  });

  it("does not retry non-transient errors and stops the run", async () => {
    const h = harness({ a: () => fail("validation", "bad column") });
    const result = await runGraph({
      graph: { nodes: [trigger(), action("a"), action("b")], edges: [edge("t", "a"), edge("a", "b")] },
      executeNode: h.executeNode,
      executionKey: "ex",
      ...noSleep,
    });
    expect(result.status).toBe("error");
    expect(result.failedNodeId).toBe("a");
    expect(result.nodes.a?.attempts).toBe(1);
    expect(result.nodes.b?.status).toBe("pending");
  });

  it("treats network exceptions as retryable", async () => {
    let n = 0;
    const h = harness({
      a: () => {
        if (++n === 1) {
          throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
        }
        return ok();
      },
    });
    const result = await runGraph({
      graph: { nodes: [trigger(), action("a")], edges: [edge("t", "a")] },
      executeNode: h.executeNode,
      executionKey: "ex",
      ...noSleep,
    });
    expect(result.status).toBe("success");
    expect(result.nodes.a?.attempts).toBe(2);
  });

  it("onError=continue lets downstream run with a null input", async () => {
    const h = harness({ a: () => fail("fatal") });
    const result = await runGraph({
      graph: {
        nodes: [trigger(), action("a", { onError: "continue" }), action("b")],
        edges: [edge("t", "a"), edge("a", "b")],
      },
      executeNode: h.executeNode,
      executionKey: "ex",
    });
    expect(result.status).toBe("success");
    expect(h.seen.b).toHaveProperty("a", null);
  });

  it("onError=branch follows only the error handle", async () => {
    const h = harness({ a: () => fail("auth") });
    const result = await runGraph({
      graph: {
        nodes: [trigger(), action("a", { onError: "branch" }), action("next"), action("alert")],
        edges: [edge("t", "a"), edge("a", "next"), edge("a", "alert", "error")],
      },
      executeNode: h.executeNode,
      executionKey: "ex",
    });
    expect(result.status).toBe("success");
    expect(result.nodes.alert?.status).toBe("success");
    expect(result.nodes.next?.status).toBe("skipped");
  });

  it("times out a hung step and reports it", async () => {
    const h = harness({ a: () => new Promise<NodeOutcome>(() => undefined) });
    const result = await runGraph({
      graph: { nodes: [trigger(), action("a", { timeoutMs: 20, retry: { maxAttempts: 1 } })], edges: [edge("t", "a")] },
      executeNode: h.executeNode,
      executionKey: "ex",
    });
    expect(result.status).toBe("error");
    expect(result.nodes.a?.error?.message).toMatch(/timed out/);
    expect(result.nodes.a?.error?.class).toBe("retryable");
  });

  it("lets in-flight branches finish but starts nothing new after a failure", async () => {
    const h = harness({
      a: () => fail("fatal"),
      b: () => tick(30).then(() => ok()),
    });
    const result = await runGraph({
      graph: {
        nodes: [trigger(), action("a"), action("b"), action("after_b")],
        edges: [edge("t", "a"), edge("t", "b"), edge("b", "after_b")],
      },
      executeNode: h.executeNode,
      executionKey: "ex",
    });
    expect(result.status).toBe("error");
    expect(result.nodes.b?.status).toBe("success");
    expect(result.nodes.after_b?.status).toBe("pending");
  });

  it("gives each node a stable idempotency key across attempts", async () => {
    const keys: string[] = [];
    let n = 0;
    const result = await runGraph({
      graph: { nodes: [trigger(), action("a")], edges: [edge("t", "a")] },
      executeNode: (args) => {
        if (args.node.id === "a") {
          keys.push(args.idempotencyKey);
          return Promise.resolve(++n < 2 ? fail("retryable") : ok());
        }
        return Promise.resolve(ok());
      },
      executionKey: "ex_42",
      ...noSleep,
    });
    expect(result.status).toBe("success");
    expect(keys).toEqual(["ex_42:a", "ex_42:a"]);
  });
});

describe("runGraph: durability", () => {
  it("suspends on a durable wait and resumes from the checkpoint later", async () => {
    const t0 = new Date("2026-10-09T10:00:00Z");
    const graph = {
      nodes: [trigger(), action("wait"), action("after")],
      edges: [edge("t", "wait"), edge("wait", "after")],
    };
    const first = harness({ wait: () => ({ status: "suspend", resumeAt: new Date(t0.getTime() + 60_000) }) });
    const r1 = await runGraph({ graph, executeNode: first.executeNode, executionKey: "ex", now: () => t0 });
    expect(r1.status).toBe("waiting");
    expect(r1.resumeAt?.toISOString()).toBe("2026-10-09T10:01:00.000Z");
    expect(first.ids()).toEqual(["t", "wait"]);

    const second = harness();
    const r2 = await runGraph({
      graph,
      executeNode: second.executeNode,
      executionKey: "ex",
      checkpoint: toCheckpoint(r1, graph),
      now: () => new Date(t0.getTime() + 61_000),
    });
    expect(r2.status).toBe("success");
    expect(second.ids()).toEqual(["after"]); // trigger and wait are not redone
    expect(second.seen.after?.wait).toMatchObject({ waitedUntil: "2026-10-09T10:01:00.000Z" });
  });

  it("stays waiting if resumed too early", async () => {
    const graph = { nodes: [trigger(), action("wait")], edges: [edge("t", "wait")] };
    const result = await runGraph({
      graph,
      executeNode: harness().executeNode,
      executionKey: "ex",
      checkpoint: { t: { status: "success", output: null }, wait: { status: "waiting", resumeAt: "2030-01-01T00:00:00Z" } },
    });
    expect(result.status).toBe("waiting");
  });

  it("resumes after a crash without re-running completed steps", async () => {
    const h = harness();
    const result = await runGraph({
      graph: {
        nodes: [trigger(), action("sheet"), action("email")],
        edges: [edge("t", "sheet"), edge("sheet", "email")],
      },
      executeNode: h.executeNode,
      executionKey: "ex",
      checkpoint: { t: { status: "success", output: { name: "Riya" } }, sheet: { status: "success", output: { row: 42 } } },
    });
    expect(result.status).toBe("success");
    expect(h.ids()).toEqual(["email"]);
    expect(h.seen.email).toEqual({ t: { name: "Riya" }, sheet: { row: 42 } });
  });

  it("reports cancellation when aborted before work is done", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runGraph({
      graph: { nodes: [trigger(), action("a")], edges: [edge("t", "a")] },
      executeNode: harness().executeNode,
      executionKey: "ex",
      signal: controller.signal,
    });
    expect(result.status).toBe("cancelled");
  });
});

describe("runGraph: circuit breaker", () => {
  it("fails fast while a provider's circuit is open", async () => {
    let clock = 0;
    const breaker = new CircuitBreaker({ minimumCalls: 2, failureRatio: 0.5, openMs: 10_000, now: () => clock });
    breaker.record("sheets", false);
    breaker.record("sheets", false);
    expect(breaker.state("sheets")).toBe("open");

    const h = harness();
    const result = await runGraph({
      graph: { nodes: [trigger(), action("a", { breakerKey: "sheets", retry: { maxAttempts: 1 } })], edges: [edge("t", "a")] },
      executeNode: h.executeNode,
      executionKey: "ex",
      breaker,
    });
    expect(h.ids()).toEqual(["t"]); // the integration was never called
    expect(result.nodes.a?.error?.message).toMatch(/Circuit open/);
    expect(result.nodes.a?.error?.retryAfterMs).toBe(10_000);

    clock = 10_000; // half-open: one probe allowed; success closes the circuit
    expect(breaker.check("sheets").allowed).toBe(true);
    breaker.record("sheets", true);
    expect(breaker.state("sheets")).toBe("closed");
  });
});
