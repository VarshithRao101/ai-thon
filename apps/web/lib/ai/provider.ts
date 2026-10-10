import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { StepError } from "@flowledger/engine";
import { APICallError, type LanguageModel } from "ai";

/**
 * N-Flow AI provider layer (docs/09, D-009). Model ids come from env only
 * (CLAUDE.md hard rule): AI_PRIMARY_PROVIDER + AI_MODEL_FAST / AI_MODEL_SMART,
 * with an optional AI_FALLBACK_PROVIDER + AI_FALLBACK_MODEL tried on failure.
 * AI_MOCK=true swaps in deterministic local outputs for development and tests.
 */
export type AiTier = "fast" | "smart";
type Provider = "google" | "groq";

export type AiCandidate = { model: LanguageModel; label: string };

export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      "AI is not configured: set GOOGLE_GENERATIVE_AI_API_KEY and AI_MODEL_FAST in apps/web/.env.local"
    );
    this.name = "AiNotConfiguredError";
  }
}

export function isAiMock(): boolean {
  return process.env.AI_MOCK === "true";
}

function isProvider(value: string | undefined): value is Provider {
  return value === "google" || value === "groq";
}

function build(
  provider: Provider,
  modelId: string | undefined
): AiCandidate | null {
  if (!modelId) {
    return null;
  }
  if (provider === "google") {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    return apiKey
      ? {
          model: createGoogleGenerativeAI({ apiKey })(modelId),
          label: `google:${modelId}`,
        }
      : null;
  }
  const apiKey = process.env.GROQ_API_KEY;
  return apiKey
    ? { model: createGroq({ apiKey })(modelId), label: `groq:${modelId}` }
    : null;
}

/** Configured models for a tier, primary first. */
export function aiCandidates(tier: AiTier): AiCandidate[] {
  const primary: Provider = isProvider(process.env.AI_PRIMARY_PROVIDER)
    ? process.env.AI_PRIMARY_PROVIDER
    : "google";
  const fast = process.env.AI_MODEL_FAST;
  const smart = process.env.AI_MODEL_SMART;
  const first = tier === "smart" ? smart || fast : fast || smart;
  const second = tier === "smart" ? fast : smart;
  const candidates = [build(primary, first)];
  // A second model on the same provider: a busy or slow model (503, timeout,
  // bad structured output) gets one more try before the fallback provider.
  if (second && second !== first) {
    candidates.push(build(primary, second));
  }
  const fallback = process.env.AI_FALLBACK_PROVIDER;
  if (isProvider(fallback)) {
    candidates.push(build(fallback, process.env.AI_FALLBACK_MODEL));
  }
  return candidates.filter((c): c is AiCandidate => c !== null);
}

export function isAiConfigured(): boolean {
  return isAiMock() || aiCandidates("fast").length > 0;
}

/** Run `fn` on the primary model, then on the fallback if the primary fails. */
export async function withAi<T>(
  tier: AiTier,
  fn: (candidate: AiCandidate) => Promise<T>
): Promise<T> {
  const candidates = aiCandidates(tier);
  if (candidates.length === 0) {
    throw new AiNotConfiguredError();
  }
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await fn(candidate);
    } catch (error) {
      lastError = error;
      console.warn(
        `[ai] ${candidate.label} failed:`,
        error instanceof Error ? error.message : error
      );
    }
  }
  throw lastError;
}

/** Turn an AI failure into a step error the engine can retry or report. */
export function aiStepError(error: unknown): StepError {
  if (error instanceof AiNotConfiguredError) {
    return { message: error.message, class: "auth" };
  }
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? 0;
    if (status === 401 || status === 403) {
      return {
        message: `AI provider rejected the API key (HTTP ${status})`,
        class: "auth",
      };
    }
    if (error.isRetryable || status === 429 || status >= 500) {
      return {
        message: `AI provider is busy (HTTP ${status || "network"})`,
        class: "retryable",
      };
    }
    return {
      message: `AI request failed: ${error.message}`,
      class: "validation",
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { message: `AI step failed: ${message}`, class: "fatal" };
}
