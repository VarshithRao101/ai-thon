import "server-only";

import { extractFields } from "@/lib/ai/actions";
import { type StepInput, withStepLogging } from "@/lib/steps/step-handler";
import { type AiStepResult, runAi } from "./shared";

export type ExtractInput = StepInput & {
  aiInput: string;
  aiFields: string;
};

export function extractStep(
  input: ExtractInput
): Promise<AiStepResult<Record<string, string | null>>> {
  return withStepLogging(input, () =>
    runAi(() => extractFields({ text: input.aiInput, fields: input.aiFields }))
  );
}

export const _integrationType = "ai";
