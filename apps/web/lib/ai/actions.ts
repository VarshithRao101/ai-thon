import "server-only";

import { generateObject, generateText } from "ai";
import { z } from "zod";
import { createShield, type PrivacyReport } from "./privacy";
import { isAiMock, withAi } from "./provider";

/**
 * The AI work inside workflow steps (docs/09 "AI nodes"). Every result names
 * the model that produced it, which is shown in the run logs.
 */

const SYSTEM =
  "You write on behalf of the user's own organisation inside an automated workflow. Be accurate and concise. Never invent facts that are not in the input, and never mention the automation tool or yourself.";

const LIST_SEPARATOR = /[,\n]/;

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(LIST_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type ClassifyResult = {
  label: string;
  confidence: number;
  reason: string;
  model: string;
  /** Privacy Shield: what was hidden from the model (lib/ai/privacy.ts). */
  privacy: PrivacyReport;
};

export async function classify(input: {
  text: string;
  labels: string;
  instructions?: string;
}): Promise<ClassifyResult> {
  const labels = splitList(input.labels);
  if (labels.length < 2) {
    throw new Error("Give at least two labels, separated by commas");
  }
  const shield = createShield();
  const text = shield.mask(input.text);
  const instructions = input.instructions
    ? shield.mask(input.instructions)
    : "";
  if (isAiMock()) {
    const lower = text.toLowerCase();
    const hit =
      labels.find((l) => lower.includes(l.toLowerCase())) ?? labels[0];
    return {
      label: hit as string,
      confidence: 0.5,
      reason: "Mock mode: keyword match",
      model: "mock",
      privacy: shield.report(),
    };
  }
  return await withAi("fast", async ({ model, label: modelLabel }) => {
    const { object } = await generateObject({
      model,
      maxRetries: 1,
      system: SYSTEM,
      schema: z.object({
        label: z.enum(labels as [string, ...string[]]),
        confidence: z.number().min(0).max(1),
        reason: z.string().max(300),
      }),
      prompt: [
        `Classify the input into exactly one of these labels: ${labels.join(", ")}.`,
        instructions ? `Guidance: ${instructions}` : "",
        "Give a confidence between 0 and 1 and a one-sentence reason.",
        `Input:\n"""${text}"""`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
    return {
      ...object,
      reason: shield.unmask(object.reason),
      model: modelLabel,
      privacy: shield.report(),
    };
  });
}

export type DraftEmailResult = {
  subject: string;
  body: string;
  model: string;
  privacy: PrivacyReport;
};

export async function draftEmail(input: {
  recipientName?: string;
  context: string;
  goal: string;
  tone?: string;
  senderName?: string;
}): Promise<DraftEmailResult> {
  const tone = input.tone || "warm and professional";
  const shield = createShield();
  const context = shield.mask(input.context);
  const goal = shield.mask(input.goal);
  if (isAiMock()) {
    const name = input.recipientName || "there";
    return {
      subject: input.goal.slice(0, 80) || "Hello from ZETA",
      body: `Hi ${name},\n\n${input.goal}\n\n${input.context}\n\nBest,\n${input.senderName || "The team"}`,
      model: "mock",
      privacy: shield.report(),
    };
  }
  return await withAi("fast", async ({ model, label }) => {
    const { object } = await generateObject({
      model,
      maxRetries: 1,
      system: SYSTEM,
      schema: z.object({
        subject: z.string().max(120),
        body: z.string().max(2000),
      }),
      prompt: [
        `Write a short, personal email (under 140 words) with a ${tone} tone.`,
        `Goal: ${goal}`,
        input.recipientName ? `Recipient: ${input.recipientName}` : "",
        input.senderName ? `Sign off as: ${input.senderName}` : "",
        `Context about the recipient:\n"""${context}"""`,
        "Plain text only. No placeholders like [Name]. Keep any [EMAIL_1]-style tokens exactly as written.",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    return {
      subject: shield.unmask(object.subject),
      body: shield.unmask(object.body),
      model: label,
      privacy: shield.report(),
    };
  });
}

/** Extracted fields by name, plus the model and the privacy report. */
export type ExtractResult = Record<string, string | null | PrivacyReport> & {
  model: string;
  privacy: PrivacyReport;
};

export async function extractFields(input: {
  text: string;
  fields: string;
}): Promise<ExtractResult> {
  const fields = splitList(input.fields);
  if (fields.length === 0) {
    throw new Error("List the fields to extract, separated by commas");
  }
  const shield = createShield();
  const text = shield.mask(input.text);
  if (isAiMock()) {
    return {
      ...Object.fromEntries(fields.map((f) => [f, null])),
      model: "mock",
      privacy: shield.report(),
    };
  }
  return await withAi("fast", async ({ model, label }) => {
    const { object } = await generateObject({
      model,
      maxRetries: 1,
      system: SYSTEM,
      schema: z.object(
        Object.fromEntries(fields.map((f) => [f, z.string().nullable()]))
      ),
      prompt: `Extract these fields from the input: ${fields.join(", ")}. Use null when a field is not present. Copy [EMAIL_1]-style tokens exactly.\nInput:\n"""${text}"""`,
    });
    return {
      ...shield.unmaskDeep(object as Record<string, string | null>),
      model: label,
      privacy: shield.report(),
    };
  });
}

export async function generate(input: {
  prompt: string;
  tone?: string;
}): Promise<{ text: string; model: string; privacy: PrivacyReport }> {
  const shield = createShield();
  const prompt = shield.mask(input.prompt);
  if (isAiMock()) {
    return {
      text: `Mock response to: ${input.prompt.slice(0, 200)}`,
      model: "mock",
      privacy: shield.report(),
    };
  }
  return await withAi("fast", async ({ model, label }) => {
    const { text } = await generateText({
      model,
      maxRetries: 1,
      system: input.tone ? `${SYSTEM} Write in a ${input.tone} tone.` : SYSTEM,
      prompt,
    });
    return {
      text: shield.unmask(text),
      model: label,
      privacy: shield.report(),
    };
  });
}
