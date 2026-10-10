import "server-only";

import { generateObject, generateText } from "ai";
import { z } from "zod";
import { isAiMock, withAi } from "./provider";

/**
 * The AI work inside workflow steps (docs/09 "AI nodes"). Every result names
 * the model that produced it, so run receipts can commit to it.
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
  if (isAiMock()) {
    const lower = input.text.toLowerCase();
    const hit =
      labels.find((l) => lower.includes(l.toLowerCase())) ?? labels[0];
    return {
      label: hit as string,
      confidence: 0.5,
      reason: "Mock mode: keyword match",
      model: "mock",
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
        input.instructions ? `Guidance: ${input.instructions}` : "",
        "Give a confidence between 0 and 1 and a one-sentence reason.",
        `Input:\n"""${input.text}"""`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
    return { ...object, model: modelLabel };
  });
}

export type DraftEmailResult = { subject: string; body: string; model: string };

export async function draftEmail(input: {
  recipientName?: string;
  context: string;
  goal: string;
  tone?: string;
  senderName?: string;
}): Promise<DraftEmailResult> {
  const tone = input.tone || "warm and professional";
  if (isAiMock()) {
    const name = input.recipientName || "there";
    return {
      subject: input.goal.slice(0, 80) || "Hello from N-Flow",
      body: `Hi ${name},\n\n${input.goal}\n\n${input.context}\n\nBest,\n${input.senderName || "The team"}`,
      model: "mock",
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
        `Goal: ${input.goal}`,
        input.recipientName ? `Recipient: ${input.recipientName}` : "",
        input.senderName ? `Sign off as: ${input.senderName}` : "",
        `Context about the recipient:\n"""${input.context}"""`,
        "Plain text only. No placeholders like [Name].",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    return { ...object, model: label };
  });
}

export async function extractFields(input: {
  text: string;
  fields: string;
}): Promise<Record<string, string | null> & { model: string }> {
  const fields = splitList(input.fields);
  if (fields.length === 0) {
    throw new Error("List the fields to extract, separated by commas");
  }
  if (isAiMock()) {
    return {
      ...Object.fromEntries(fields.map((f) => [f, null])),
      model: "mock",
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
      prompt: `Extract these fields from the input: ${fields.join(", ")}. Use null when a field is not present.\nInput:\n"""${input.text}"""`,
    });
    return { ...(object as Record<string, string | null>), model: label };
  });
}

export async function generate(input: {
  prompt: string;
  tone?: string;
}): Promise<{ text: string; model: string }> {
  if (isAiMock()) {
    return {
      text: `Mock response to: ${input.prompt.slice(0, 200)}`,
      model: "mock",
    };
  }
  return await withAi("fast", async ({ model, label }) => {
    const { text } = await generateText({
      model,
      maxRetries: 1,
      system: input.tone ? `${SYSTEM} Write in a ${input.tone} tone.` : SYSTEM,
      prompt: input.prompt,
    });
    return { text, model: label };
  });
}
