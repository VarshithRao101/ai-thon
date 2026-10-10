import "server-only";

import { generateObject } from "ai";
import { type CopilotPlan, catalogPrompt, planSchema } from "./plan";
import { createShield } from "./privacy";
import { isAiMock, withAi } from "./provider";
import { closestTemplate } from "./templates";

export type PlanResult = {
  plan: CopilotPlan;
  source: "ai" | "template";
  model?: string;
  reason?: string;
};

// Per model attempt; withAi may try a second model after this.
const TIMEOUT_MS = 20_000;

function systemPrompt(): string {
  return `You design automations for N-Flow, a no-code workflow tool for Indian colleges, clinics and small businesses.
Turn the user's request into a plan: one trigger and 1-8 steps.

Triggers:
- Form: a hosted form (give formTitle and formFields). Form outputs: every field key, plus submittedAt, runId.
- Webhook: an HTTP POST from another app. Outputs: the JSON body fields, plus runId, timestamp.
- Schedule: a cron in IST (scheduleCron). Outputs: timestamp, runId.
- Manual: a test button.

Steps (use ONLY these action ids):
${catalogPrompt()}

References: write {{trigger.<field>}} or {{<stepId>.<output>}} inside config values. Only reference the trigger or EARLIER steps.
Connections: steps run after the previous step unless you set "after" (use it to run steps in parallel after the same step).
Rules:
- Prefer AI steps where they add value (classify, draft personalised emails).
- Email bodies are plain text. Put "\\n" between lines.
- For Google Sheets, rowValues has one value per line in column order.
- Condition expressions compare references with single-quoted strings, e.g. {{score.label}} === 'Hot'.
- Never invent API keys, email addresses or URLs; use references or leave them empty.
- For a Form trigger, formFields MUST include every field you reference as {{trigger.<key>}}, with the SAME key (e.g. if you write {{trigger.fullName}}, add a field with key "fullName"). Include an "email" field (type email) whenever an email goes to the person who filled the form, and send it to {{trigger.email}}.
- A Condition must compare a classifier's {{<id>.label}} with one of the exact labels you gave that classifier.
- Keep labels short (2-4 words).
- Copy placeholders like [EMAIL_1] or [PHONE_1] exactly where those values are needed.`;
}

/** Ask the model for a plan; fall back to the closest template if it can't answer. */
export async function planWorkflow(
  prompt: string,
  existing?: { name?: string; summary?: string }
): Promise<PlanResult> {
  if (isAiMock()) {
    return {
      plan: closestTemplate(prompt).plan,
      source: "template",
      reason: "AI mock mode",
    };
  }
  // Privacy Shield: addresses and numbers in the request stay on our server.
  const shield = createShield();
  const request = shield.mask(prompt);
  const userPrompt = existing?.summary
    ? `Current workflow "${existing.name ?? "Untitled"}":\n${shield.mask(existing.summary)}\n\nChange it as follows, and return the COMPLETE updated plan:\n${request}`
    : request;
  try {
    return await withAi("smart", async ({ model, label }) => {
      const { object } = await generateObject({
        model,
        schema: planSchema,
        system: systemPrompt(),
        prompt: userPrompt,
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        // A quota error won't clear in seconds; move to the next model instead.
        maxRetries: 1,
      });
      return {
        plan: shield.unmaskDeep(object),
        source: "ai" as const,
        model: label,
      };
    });
  } catch (error) {
    const reason =
      error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.warn("[copilot] falling back to a template:", reason);
    return { plan: closestTemplate(prompt).plan, source: "template", reason };
  }
}

/** A one-line-per-step summary of an existing canvas, for "edit" requests. */
export function summarizeCanvas(
  nodes: {
    id: string;
    data?: { label?: string; type?: string; config?: Record<string, unknown> };
  }[]
): string {
  return nodes
    .map((n) => {
      const kind =
        n.data?.type === "trigger"
          ? String(n.data?.config?.triggerType ?? "Manual")
          : String(n.data?.config?.actionType ?? "?");
      return `- ${n.data?.label || n.id}: ${kind}`;
    })
    .join("\n");
}
