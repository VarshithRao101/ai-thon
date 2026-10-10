import "server-only";

import { type ClassifyResult, classify } from "@/lib/ai/actions";
import { type StepInput, withStepLogging } from "@/lib/steps/step-handler";
import { type AiStepResult, runAi } from "./shared";

export type ClassifyInput = StepInput & {
  aiInput: string;
  aiLabels: string;
  aiInstructions?: string;
};

export function classifyStep(input: ClassifyInput): Promise<AiStepResult<ClassifyResult>> {
  return withStepLogging(input, () =>
    runAi(() =>
      classify({
        text: input.aiInput,
        labels: input.aiLabels,
        instructions: input.aiInstructions,
      })
    )
  );
}

export const _integrationType = "ai";
