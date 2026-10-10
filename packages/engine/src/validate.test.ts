import { describe, expect, it } from "vitest";
import { backoffDelay, classifyHttpStatus, parseRetryAfter } from "./retry";
import type { Graph } from "./types";
import { validateGraph } from "./validate";

const n = (id: string, kind: "trigger" | "action" = "action") => ({ id, kind, label: id, enabled: true });
const e = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });

describe("validateGraph", () => {
  it("accepts a well-formed graph", () => {
    const graph: Graph = { nodes: [n("t", "trigger"), n("a"), n("b")], edges: [e("t", "a"), e("a", "b")] };
    expect(validateGraph(graph, (id) => (id === "b" ? ["t", "a"] : []))).toEqual([]);
  });

  it("requires exactly one trigger", () => {
    expect(validateGraph({ nodes: [n("a")], edges: [] }).map((i) => i.code)).toContain("no-trigger");
    const two = validateGraph({ nodes: [n("t1", "trigger"), n("t2", "trigger")], edges: [] });
    expect(two.map((i) => i.code)).toContain("multiple-triggers");
  });

  it("finds cycles", () => {
    const issues = validateGraph({
      nodes: [n("t", "trigger"), n("a"), n("b")],
      edges: [e("t", "a"), e("a", "b"), e("b", "a")],
    });
    expect(issues.filter((i) => i.code === "cycle").map((i) => i.nodeId).sort()).toEqual(["a", "b"]);
  });

  it("finds unreachable steps, self loops and dangling edges", () => {
    const codes = validateGraph({
      nodes: [n("t", "trigger"), n("lonely"), n("a")],
      edges: [e("t", "a"), e("a", "a"), e("a", "ghost")],
    }).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["unreachable", "self-loop", "dangling-edge"]));
  });

  it("rejects a trigger with incoming edges", () => {
    const codes = validateGraph({ nodes: [n("t", "trigger"), n("a")], edges: [e("t", "a"), e("a", "t")] }).map(
      (i) => i.code
    );
    expect(codes).toContain("trigger-has-input");
  });

  it("only allows template references to earlier steps", () => {
    const graph: Graph = { nodes: [n("t", "trigger"), n("a"), n("b")], edges: [e("t", "a"), e("t", "b")] };
    const codes = validateGraph(graph, (id) => (id === "a" ? ["b", "missing"] : [])).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["reference-not-upstream", "unknown-reference"]));
  });
});

describe("retry helpers", () => {
  const policy = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 30_000 };

  it("bounds backoff by the exponential ceiling and the max", () => {
    expect(backoffDelay(1, policy, () => 0.999)).toBeLessThan(1000);
    expect(backoffDelay(3, policy, () => 0.999)).toBeLessThan(4000);
    expect(backoffDelay(20, policy, () => 0.999)).toBeLessThan(30_000);
  });

  it("honors a longer Retry-After", () => {
    expect(backoffDelay(1, policy, () => 0, 7000)).toBe(7000);
  });

  it("classifies HTTP statuses", () => {
    expect([429, 503, 408, 401, 404].map(classifyHttpStatus)).toEqual([
      "retryable",
      "retryable",
      "retryable",
      "auth",
      "validation",
    ]);
  });

  it("parses Retry-After seconds and dates", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    expect(parseRetryAfter("Fri, 09 Oct 2026 10:00:10 GMT", Date.parse("2026-10-09T10:00:00Z"))).toBe(10_000);
    expect(parseRetryAfter(undefined)).toBeUndefined();
  });
});
