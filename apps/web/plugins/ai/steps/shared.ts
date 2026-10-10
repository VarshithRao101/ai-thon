import "server-only";

import type { StepError } from "@flowledger/engine";
import { aiStepError } from "@/lib/ai/provider";

export type AiStepResult<T> =
  | { success: true; data: T }
  | { success: false; error: StepError };

const INPUT_ERRORS = /at least two labels|List the fields/;

/** Run an AI action and return the standard step result shape. */
export async function runAi<T>(fn: () => Promise<T>): Promise<AiStepResult<T>> {
  try {
    return { success: true, data: await fn() };
  } catch (error) {
    if (error instanceof Error && INPUT_ERRORS.test(error.message)) {
      return { success: false, error: { message: error.message, class: "validation" } };
    }
    return { success: false, error: aiStepError(error) };
  }
}
