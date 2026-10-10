/**
 * Template variables and condition evaluation for workflow steps.
 *
 * Ported from the base template's executor (vercel-labs/workflow-builder-template,
 * lib/workflow-executor.workflow.ts, Apache-2.0; see NOTICE) so Hive keeps the
 * exact `{{@nodeId:Label.field}}` semantics the builder UI produces.
 */
import {
  preValidateConditionExpression,
  validateConditionExpression,
} from "@/lib/condition-validator";

/** Outputs keyed by sanitized node id, as templates reference them. */
export type NodeOutputs = Record<string, { label: string; data: unknown }>;

const TEMPLATE_PATTERN = /\{\{@([^:]+):([^}]+)\}\}/g;
const NON_IDENTIFIER = /[^a-zA-Z0-9]/g;

export function sanitizeNodeId(nodeId: string): string {
  return nodeId.replace(NON_IDENTIFIER, "_");
}

/** Node ids referenced by `{{@nodeId:...}}` anywhere in a config object. */
export function templateReferences(config: unknown): string[] {
  const refs = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      for (const match of value.matchAll(TEMPLATE_PATTERN)) {
        if (match[1]) {
          refs.add(match[1]);
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  visit(config);
  return [...refs];
}

/**
 * Walk `rest` ("Label.field.sub") into a node's output. Standardized step
 * results `{ success, data, error }` are unwrapped automatically unless the
 * path explicitly asks for success/data/error.
 */
function resolvePath(
  output: { data: unknown },
  rest: string
): { found: boolean; value: unknown } {
  const dotIndex = rest.indexOf(".");
  if (dotIndex === -1) {
    return { found: true, value: output.data };
  }
  if (output.data === null || output.data === undefined) {
    return { found: true, value: undefined };
  }
  const fields = rest.substring(dotIndex + 1).split(".");
  // biome-ignore lint/suspicious/noExplicitAny: dynamic output traversal
  let current: any = output.data;
  const first = fields[0];
  if (
    current &&
    typeof current === "object" &&
    "success" in current &&
    "data" in current &&
    first !== "success" &&
    first !== "data" &&
    first !== "error"
  ) {
    current = current.data;
  }
  for (const field of fields) {
    if (current && typeof current === "object") {
      current = current[field];
    } else {
      return { found: false, value: undefined };
    }
  }
  return { found: true, value: current };
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/** Replace template variables in every string field of a step config. */
export function processTemplates(
  config: Record<string, unknown>,
  outputs: NodeOutputs
): Record<string, unknown> {
  const processed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value !== "string") {
      processed[key] = value;
      continue;
    }
    processed[key] = value.replace(
      TEMPLATE_PATTERN,
      (match, nodeId: string, rest: string) => {
        const output = outputs[sanitizeNodeId(nodeId)];
        if (!output) {
          return match;
        }
        const { found, value: resolved } = resolvePath(output, rest);
        return found ? stringify(resolved) : "";
      }
    );
  }
  return processed;
}

export type ConditionResult = {
  result: boolean;
  resolvedValues: Record<string, unknown>;
};

/**
 * Evaluate a condition expression. Template variables become opaque locals
 * (__v0, __v1, ...) and the expression is validated against a whitelist
 * (lib/condition-validator.ts) before evaluation, so user input cannot run code.
 */
export function evaluateCondition(
  expression: unknown,
  outputs: NodeOutputs
): ConditionResult {
  if (typeof expression === "boolean") {
    return { result: expression, resolvedValues: {} };
  }
  if (typeof expression !== "string") {
    return { result: Boolean(expression), resolvedValues: {} };
  }
  if (!preValidateConditionExpression(expression).valid) {
    return { result: false, resolvedValues: {} };
  }

  const locals: Record<string, unknown> = {};
  const resolvedValues: Record<string, unknown> = {};
  let counter = 0;
  const transformed = expression.replace(
    TEMPLATE_PATTERN,
    (match, nodeId: string, rest: string) => {
      const output = outputs[sanitizeNodeId(nodeId)];
      if (!output) {
        return match;
      }
      const name = `__v${counter}`;
      counter += 1;
      const { value } = resolvePath(output, rest);
      locals[name] = value;
      resolvedValues[rest] = value;
      return name;
    }
  );

  if (!validateConditionExpression(transformed).valid) {
    return { result: false, resolvedValues };
  }
  try {
    // Safe: the expression contains only whitelisted operators, literals and __vN locals.
    const evaluate = new Function(
      ...Object.keys(locals),
      `return (${transformed});`
    );
    return {
      result: Boolean(evaluate(...Object.values(locals))),
      resolvedValues,
    };
  } catch {
    return { result: false, resolvedValues };
  }
}
