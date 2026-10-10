import type { Graph } from "./types";

export type GraphIssue = {
  code:
    | "no-trigger"
    | "multiple-triggers"
    | "dangling-edge"
    | "self-loop"
    | "cycle"
    | "unreachable"
    | "trigger-has-input"
    | "unknown-reference"
    | "reference-not-upstream";
  message: string;
  nodeId?: string;
};

/**
 * Validate a workflow graph before publishing (docs/07 "At publish time").
 * `referencesOf` returns the node ids a node's config refers to (template
 * variables); each must exist and be an ancestor of that node.
 */
export function validateGraph(
  graph: Graph,
  referencesOf: (nodeId: string) => string[] = () => []
): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const ids = new Set(graph.nodes.map((n) => n.id));
  const triggers = graph.nodes.filter((n) => n.kind === "trigger");

  if (triggers.length === 0) {
    issues.push({ code: "no-trigger", message: "A workflow needs exactly one trigger" });
  } else if (triggers.length > 1) {
    for (const t of triggers.slice(1)) {
      issues.push({ code: "multiple-triggers", message: "Only one trigger is allowed", nodeId: t.id });
    }
  }

  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const id of ids) {
    incoming.set(id, []);
    outgoing.set(id, []);
  }
  for (const edge of graph.edges) {
    if (!(ids.has(edge.source) && ids.has(edge.target))) {
      issues.push({ code: "dangling-edge", message: `Edge ${edge.id} points to a missing node` });
      continue;
    }
    if (edge.source === edge.target) {
      issues.push({ code: "self-loop", message: "A step cannot connect to itself", nodeId: edge.source });
      continue;
    }
    outgoing.get(edge.source)?.push(edge.target);
    incoming.get(edge.target)?.push(edge.source);
  }

  for (const t of triggers) {
    if ((incoming.get(t.id)?.length ?? 0) > 0) {
      issues.push({ code: "trigger-has-input", message: "A trigger cannot have incoming connections", nodeId: t.id });
    }
  }

  // Kahn's algorithm: any node left unprocessed sits on a cycle.
  const indegree = new Map([...incoming].map(([id, from]) => [id, from.length]));
  const queue = [...ids].filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) {
        queue.push(next);
      }
    }
  }
  if (order.length < ids.size) {
    for (const id of ids) {
      if (!order.includes(id)) {
        issues.push({ code: "cycle", message: "This step is part of a loop", nodeId: id });
      }
    }
  }

  // Reachability from the trigger.
  const trigger = triggers[0];
  const ancestors = new Map<string, Set<string>>();
  if (trigger) {
    const reachable = new Set<string>([trigger.id]);
    const stack = [trigger.id];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      for (const next of outgoing.get(id) ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next);
          stack.push(next);
        }
      }
    }
    for (const node of graph.nodes) {
      if (!reachable.has(node.id)) {
        issues.push({ code: "unreachable", message: "This step is not connected to the trigger", nodeId: node.id });
      }
    }
  }

  // Template references must point to existing upstream nodes.
  const ancestorsOf = (id: string): Set<string> => {
    const cached = ancestors.get(id);
    if (cached) {
      return cached;
    }
    const result = new Set<string>();
    const stack = [...(incoming.get(id) ?? [])];
    while (stack.length > 0) {
      const parent = stack.pop() as string;
      if (!result.has(parent)) {
        result.add(parent);
        stack.push(...(incoming.get(parent) ?? []));
      }
    }
    ancestors.set(id, result);
    return result;
  };
  for (const node of graph.nodes) {
    for (const ref of referencesOf(node.id)) {
      if (!ids.has(ref)) {
        issues.push({ code: "unknown-reference", message: `Refers to a step that no longer exists (${ref})`, nodeId: node.id });
      } else if (!ancestorsOf(node.id).has(ref)) {
        issues.push({ code: "reference-not-upstream", message: "Can only use data from earlier steps", nodeId: node.id });
      }
    }
  }

  return issues;
}
