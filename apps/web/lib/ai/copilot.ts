import "server-only";

import { generateObject } from "ai";
import { HttpError } from "@/lib/api/route";
import {
  type Catalog,
  type CopilotPlan,
  catalogPrompt,
  makePlanSchema,
} from "./plan";
import { createShield } from "./privacy";
import { isAiMock, withAi } from "./provider";
import { closestTemplate, templateMatch } from "./templates";

export type PlanResult = {
  plan: CopilotPlan;
  source: "ai" | "template";
  model?: string;
  reason?: string;
};

// Keywords a template must share with a request to stand in for the AI.
const MIN_TEMPLATE_MATCH = 2;

// Per model attempt; withAi may try a second model after this.
const TIMEOUT_MS = 20_000;

function systemPrompt(extra: Catalog, request: string): string {
  return `You design automations for ZETA, a no-code workflow tool for Indian colleges, clinics and small businesses.
Turn the user's request into a plan: one trigger and 1-8 steps.

Triggers:
- Form: a hosted form (give formTitle and formFields). Form outputs: every field key, plus submittedAt, runId, submissionNumber (1 for the first submission, 2 for the second, ...).
- Webhook: an HTTP POST from another app. Outputs: the JSON body fields, plus runId, timestamp.
- Schedule: a cron in IST (scheduleCron). Outputs: timestamp, runId.
- Manual: a test button.

Steps (use ONLY these action ids):
${catalogPrompt(extra, request)}

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
- For exact checks on text or numbers (an email ending with @lpu.in, a city equal to 'Warangal', an amount over 1000) use a Condition such as {{trigger.email}}.endsWith('@lpu.in'). Use ai/classify only when judgement is needed.
- "First N submissions" or "after N": use a Condition on {{trigger.submissionNumber}} (e.g. {{trigger.submissionNumber}} <= 5). ZETA counts submissions itself.
- Use HTTP Request ONLY when the user gives a real URL. Never use it to count, store or look up ZETA's own data, and never invent an endpoint.
- When the user names an app (Slack, GitHub, Stripe...), use that app's action ids from the list above.
- Copy placeholders like [EMAIL_1] or [PHONE_1] exactly where those values are needed.`;
}

const REMOVE_WORDS =
  /\b(remove|delete|drop|without|instead|replace|no longer|stop|only)\b|हटा|తీసి/i;
const SUMMARY_KIND = /^- .*: (.+)$/;

/**
 * Slips a model makes that we can name exactly: an AI-drafted email that is
 * never sent, or an edit that silently drops a step the user did not mention.
 */
export function planProblems(
  plan: CopilotPlan,
  request: string,
  existingSummary?: string
): string[] {
  const problems: string[] = [];
  const actions = plan.steps.map((s) => s.action);
  const draftAt = actions.indexOf("ai/draft-email");
  if (
    draftAt >= 0 &&
    !actions.slice(draftAt + 1).includes("smtp-email/send-email")
  ) {
    problems.push(
      'An "ai/draft-email" step only writes the email. Add a "smtp-email/send-email" step after it that sends {{<draftId>.subject}} and {{<draftId>.body}}.'
    );
  }
  if (existingSummary && !REMOVE_WORDS.test(request)) {
    const before = existingSummary
      .split("\n")
      .map((line) => line.match(SUMMARY_KIND)?.[1]?.trim())
      .filter((k): k is string => Boolean(k) && k !== "Form" && k !== "?");
    const kept = new Set(actions);
    const dropped = [...new Set(before)].filter(
      (k) => k.includes("/") && !kept.has(k)
    );
    if (dropped.length > 0) {
      problems.push(
        `The user did not ask to remove anything, but these steps from the current workflow are missing: ${dropped.join(", ")}. Keep every existing step and apply only the requested change.`
      );
    }
  }
  return problems;
}

/** Ask the model for a plan; fall back to the closest template if it can't answer. */
export async function planWorkflow(
  prompt: string,
  existing?: { name?: string; summary?: string },
  // Actions of the other apps in play (lib/ai/plugin-catalog.ts).
  extra: Catalog = {}
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
  const context = `${prompt}\n${existing?.summary ?? ""}`;
  const schema = makePlanSchema(extra, context);
  const system = systemPrompt(extra, context);
  try {
    return await withAi("smart", async ({ model, label }) => {
      const ask = async (text: string) =>
        (
          await generateObject({
            model,
            schema,
            system,
            prompt: text,
            abortSignal: AbortSignal.timeout(TIMEOUT_MS),
            // A quota error won't clear in seconds; move to the next model instead.
            maxRetries: 1,
          })
        ).object;
      let object = await ask(userPrompt);
      // Self-check: one correction round for slips we can name precisely.
      const problems = planProblems(object, prompt, existing?.summary);
      if (problems.length > 0) {
        object = await ask(
          `${userPrompt}\n\nYour previous plan had these problems:\n${problems.map((p) => `- ${p}`).join("\n")}\nReturn the corrected COMPLETE plan.`
        );
      }
      return {
        plan: shield.unmaskDeep(object),
        source: "ai" as const,
        model: label,
      };
    });
  } catch (error) {
    const reason =
      error instanceof Error ? error.message.split("\n")[0] : String(error);
    // A template is only a fair stand-in when it clearly matches the request,
    // and never for an edit (it would replace the person's workflow).
    const match = templateMatch(prompt);
    if (existing?.summary || match.score < MIN_TEMPLATE_MATCH) {
      console.warn("[copilot] AI unavailable, no close template:", reason);
      throw new HttpError(
        503,
        "ZETA's AI is busy right now. Wait a minute and try again; nothing was changed."
      );
    }
    console.warn("[copilot] falling back to a template:", reason);
    return { plan: match.template.plan, source: "template", reason };
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
