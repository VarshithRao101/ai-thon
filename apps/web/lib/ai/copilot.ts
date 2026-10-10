import "server-only";

import { generateObject } from "ai";
import { type CopilotPlan, catalogPrompt, planSchema } from "./plan";
import { isAiMock, withAi } from "./provider";
import { closestTemplate } from "./templates";

export type PlanResult = {
  plan: CopilotPlan;
  source: "ai" | "template";
  model?: string;
  reason?: string;
};

const TIMEOUT_MS = 25_000;

function systemPrompt(): string {
  return `You design automations for N-Flow, a no-code workflow tool for Indian colleges, clinics and small businesses.
Turn the user's request into a plan: one trigger and 1-8 steps.

Triggers:
- Form: a hosted form (give formTitle and formFields). Form outputs: every field key, plus submittedAt, runId, verifyUrl.
- Webhook: an HTTP POST from another app. Outputs: the JSON body fields, plus runId, verifyUrl, timestamp.
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
- Keep labels short (2-4 words).`;
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
  const userPrompt = existing?.summary
    ? `Current workflow "${existing.name ?? "Untitled"}":\n${existing.summary}\n\nChange it as follows, and return the COMPLETE updated plan:\n${prompt}`
    : prompt;
  try {
    return await withAi("smart", async ({ model, label }) => {
      const { object } = await generateObject({
        model,
        schema: planSchema,
        system: systemPrompt(),
        prompt: userPrompt,
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return { plan: object, source: "ai" as const, model: label };
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
