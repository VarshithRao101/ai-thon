import "server-only";

import { generate } from "@/lib/ai/actions";
import { type StepInput, withStepLogging } from "@/lib/steps/step-handler";
import { type AiStepResult, runAi } from "./shared";

export type GenerateInput = StepInput & {
  aiPrompt: string;
  aiTone?: string;
};

export function generateStep(
  input: GenerateInput
): Promise<AiStepResult<{ text: string; model: string }>> {
  return withStepLogging(input, () =>
    runAi(() => generate({ prompt: input.aiPrompt, tone: input.aiTone }))
  );
}

export const _integrationType = "ai";
