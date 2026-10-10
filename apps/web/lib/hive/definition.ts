import { createHash } from "node:crypto";
import type {
  EngineEdge,
  EngineNode,
  Graph,
  OnError,
} from "@flowledger/engine";
import canonicalize from "canonicalize";
import { templateReferences } from "./templates";

/**
 * The executable part of a workflow: what runs, not where it sits on the canvas.
 * Stored in workflow_versions.definition and hashed for the Proof-of-Execution
 * ledger, so moving a node around never changes the hash but editing a step does.
 */
export type DefinitionNode = {
  id: string;
  type: "trigger" | "action";
  data: {
    label: string;
    description?: string;
    type: "trigger" | "action";
    config: Record<string, unknown>;
    enabled: boolean;
  };
};
export type DefinitionEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
};
export type Definition = { nodes: DefinitionNode[]; edges: DefinitionEdge[] };

type CanvasNode = {
  id: string;
  type?: string;
  data?: {
    label?: string;
    description?: string;
    type?: string;
    config?: Record<string, unknown>;
    enabled?: boolean;
  };
};
type CanvasEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
};

/** Strip UI-only state (positions, selection, run status, placeholder nodes). */
export function normalizeDefinition(
  nodes: CanvasNode[],
  edges: CanvasEdge[]
): Definition {
  const kept: DefinitionNode[] = [];
  for (const node of nodes) {
    const kind = node.data?.type;
    if (kind !== "trigger" && kind !== "action") {
      continue; // e.g. the "add step" placeholder
    }
    kept.push({
      id: node.id,
      type: kind,
      data: {
        label: node.data?.label ?? "",
        ...(node.data?.description
          ? { description: node.data.description }
          : {}),
        type: kind,
        config: node.data?.config ?? {},
        enabled: node.data?.enabled !== false,
      },
    });
  }
  const ids = new Set(kept.map((n) => n.id));
  return {
    nodes: kept,
    edges: edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
      })),
  };
}

/** sha256 of the RFC 8785 canonical JSON of a definition, as 0x-hex. */
export function definitionHash(definition: Definition): string {
  const canonical = canonicalize(definition);
  if (canonical === undefined) {
    throw new Error("Definition is not serializable");
  }
  return `0x${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

const AI_TIMEOUT_MS = 60_000;
const HTTP_TIMEOUT_MS = 15_000;

function stepTimeout(actionType: string): number | undefined {
  const lower = actionType.toLowerCase();
  if (
    lower.includes("ai") ||
    lower.includes("generate") ||
    lower.includes("perplexity")
  ) {
    return AI_TIMEOUT_MS;
  }
  if (actionType === "HTTP Request") {
    return HTTP_TIMEOUT_MS;
  }
  return;
}

function onErrorPolicy(config: Record<string, unknown>): OnError | undefined {
  const value = config.onError;
  return value === "continue" || value === "branch" || value === "stop"
    ? value
    : undefined;
}

/** Convert a stored definition into the engine's graph model. */
export function toEngineGraph(definition: Definition): Graph {
  const nodes: EngineNode[] = definition.nodes.map((node) => {
    const config = node.data.config;
    const actionType =
      typeof config.actionType === "string" ? config.actionType : "";
    const triggerType =
      typeof config.triggerType === "string" ? config.triggerType : "";
    const maxAttempts = Number(config.retryMaxAttempts);
    return {
      id: node.id,
      kind: node.type,
      label: node.data.label || actionType || triggerType || node.type,
      enabled: node.data.enabled,
      onError: onErrorPolicy(config),
      retry:
        Number.isInteger(maxAttempts) && maxAttempts > 0
          ? { maxAttempts }
          : undefined,
      timeoutMs: node.type === "action" ? stepTimeout(actionType) : undefined,
      // Plugin actions look like "resend/send-email": breaker per provider.
      breakerKey: actionType.includes("/")
        ? actionType.split("/")[0]
        : undefined,
    };
  });
  const edges: EngineEdge[] = definition.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
  }));
  return { nodes, edges };
}

/** Template references per node, for the publish-time validator. */
export function referencesOf(
  definition: Definition
): (nodeId: string) => string[] {
  const byId = new Map(definition.nodes.map((n) => [n.id, n]));
  return (nodeId) => templateReferences(byId.get(nodeId)?.data.config ?? {});
}
