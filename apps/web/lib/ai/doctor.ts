import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import { formFromConfig } from "@/lib/forms/schema";
import type { Definition, DefinitionNode } from "@/lib/hive/definition";
import { COPILOT_ACTIONS } from "./plan";
import { isAiConfigured, isAiMock, withAi } from "./provider";

/**
 * Run Doctor (docs/09): explain a failed step in plain language and, where it
 * is safe, propose a one-field fix to the draft. Rules handle the common cases
 * deterministically; the model adds an explanation and can propose a fix that
 * must pass the same checks before it is offered.
 */

export type DoctorFix = {
  nodeId: string;
  key: string;
  value: string;
  label: string;
};

export type Diagnosis = {
  stepLabel: string;
  cause: string;
  suggestion: string;
  fix: DoctorFix | null;
  /** Reconnect this integration type (Connections). */
  reconnect: string | null;
  retryable: boolean;
  source: "ai" | "rules";
  model?: string;
};

export type DoctorInput = {
  definition: Definition;
  failedNodeId: string;
  error: string;
  errorClass: string | null;
  /** The step's resolved input as logged (redacted). */
  input: unknown;
};

const INTEGRATION_LABEL: Record<string, string> = {
  "google-sheets": "Google Sheets",
  "smtp-email": "Email (Gmail)",
  telegram: "Telegram",
};

const FIELD_LABEL: Record<string, string> = {
  emailTo: "To",
  emailSubject: "Subject",
  emailBody: "Body",
  telegramText: "Message",
  rowValues: "Row values",
  aiInput: "Text",
  aiLabels: "Labels",
};

function triggerOf(definition: Definition): DefinitionNode | undefined {
  return definition.nodes.find((n) => n.type === "trigger");
}

/** `{{@id:Label.field}}` for a trigger field. */
function triggerRef(trigger: DefinitionNode, field: string): string {
  return `{{@${trigger.id}:${trigger.data.label || "Trigger"}.${field}}}`;
}

const MAIL_KEY = /mail/i;
const EMAIL_ERROR = /not a valid email address/i;
const AUTH_HINT = /connect|api key|app password|login|token|rejected/i;

/** Deterministic diagnosis for the failures we know well. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one branch per known failure class, read top to bottom
export function ruleDiagnosis(input: DoctorInput): Diagnosis {
  const node = input.definition.nodes.find((n) => n.id === input.failedNodeId);
  const stepLabel = node?.data.label || "This step";
  const actionType = String(node?.data.config.actionType ?? "");
  const integration = actionType.includes("/")
    ? (actionType.split("/")[0] ?? null)
    : null;
  const base: Diagnosis = {
    stepLabel,
    cause: input.error,
    suggestion: "Check the step's settings, then run it again.",
    fix: null,
    reconnect: null,
    retryable: input.errorClass === "retryable",
    source: "rules",
  };

  if (
    input.errorClass === "auth" ||
    (integration && AUTH_HINT.test(input.error))
  ) {
    const name = integration
      ? (INTEGRATION_LABEL[integration] ?? integration)
      : "the service";
    return {
      ...base,
      cause: `"${stepLabel}" could not sign in to ${name}: ${input.error}`,
      suggestion: `Open Connections, add or re-test the ${name} connection, then run again.`,
      reconnect: integration,
      retryable: false,
    };
  }

  if (input.errorClass === "retryable") {
    return {
      ...base,
      cause: `"${stepLabel}" hit a temporary problem (${input.error}). The engine already retried with backoff.`,
      suggestion:
        "This is usually transient. Retry the run; completed steps will not repeat.",
      retryable: true,
    };
  }

  const trigger = triggerOf(input.definition);
  if (node && trigger && EMAIL_ERROR.test(input.error)) {
    const fields =
      trigger.data.config.triggerType === "Form"
        ? formFromConfig(trigger.data.config).fields
        : [];
    const emailField =
      fields.find((f) => f.type === "email") ??
      fields.find((f) => MAIL_KEY.test(f.key));
    const current = String(node.data.config.emailTo ?? "");
    if (emailField) {
      const value = triggerRef(trigger, emailField.key);
      return {
        ...base,
        cause: `The "To" field of "${stepLabel}" is ${current ? `"${current}"` : "empty"}, which did not resolve to an email address for this run.`,
        suggestion: `Send to the form's "${emailField.label}" answer instead.`,
        fix:
          value === current
            ? null
            : {
                nodeId: node.id,
                key: "emailTo",
                value,
                label: `To → ${emailField.label}`,
              },
      };
    }
  }
  return base;
}

const doctorSchema = z.object({
  cause: z.string().describe("Plain-language cause, 1-2 sentences, no jargon"),
  suggestion: z.string().describe("What the user should do, 1 sentence"),
  fixKey: z
    .string()
    .optional()
    .describe(
      "Config key to change on the failed step, if a single change fixes it"
    ),
  fixValue: z
    .string()
    .optional()
    .describe("New value for that key; references use {{trigger.<field>}}"),
});

const REF = /\{\{\s*trigger\.([\w]+)\s*\}\}/g;

/** Rules first; then let the model explain (and maybe fix) when rules found no fix. */
export async function diagnose(input: DoctorInput): Promise<Diagnosis> {
  const rules = ruleDiagnosis(input);
  if (rules.fix || rules.reconnect || isAiMock() || !isAiConfigured()) {
    return rules;
  }
  const node = input.definition.nodes.find((n) => n.id === input.failedNodeId);
  const trigger = triggerOf(input.definition);
  if (!(node && trigger)) {
    return rules;
  }
  const actionType = String(node.data.config.actionType ?? "");
  const allowedKeys = Object.keys(
    (COPILOT_ACTIONS as Record<string, { config: Record<string, string> }>)[
      actionType
    ]?.config ?? {}
  );
  const formFields =
    trigger.data.config.triggerType === "Form"
      ? formFromConfig(trigger.data.config)
          .fields.map((f) => `${f.key} (${f.label})`)
          .join(", ")
      : "unknown";
  try {
    return await withAi("fast", async ({ model, label }) => {
      const { object } = await generateObject({
        model,
        schema: doctorSchema,
        abortSignal: AbortSignal.timeout(20_000),
        system:
          "You are FlowLedger's Run Doctor. Explain why a workflow step failed, for a non-technical user. Propose a fix only if changing ONE config key would fix it.",
        prompt: [
          `Step: "${node.data.label}" (${actionType})`,
          `Error (${input.errorClass ?? "unknown"}): ${input.error}`,
          `Step config: ${JSON.stringify(node.data.config).slice(0, 1500)}`,
          `Resolved input for this run: ${JSON.stringify(input.input ?? null).slice(0, 1500)}`,
          `Trigger fields available: ${formFields}`,
          `Keys you may change: ${allowedKeys.join(", ") || "none"}`,
        ].join("\n"),
      });
      let fix: DoctorFix | null = null;
      if (
        object.fixKey &&
        object.fixValue !== undefined &&
        allowedKeys.includes(object.fixKey)
      ) {
        const value = object.fixValue.replace(REF, (_m, field: string) =>
          triggerRef(trigger, field)
        );
        fix = {
          nodeId: node.id,
          key: object.fixKey,
          value,
          label: `${FIELD_LABEL[object.fixKey] ?? object.fixKey} → ${object.fixValue.slice(0, 40)}`,
        };
      }
      return {
        ...rules,
        cause: object.cause,
        suggestion: object.suggestion,
        fix,
        source: "ai" as const,
        model: label,
      };
    });
  } catch {
    return rules;
  }
}
