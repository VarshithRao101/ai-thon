import "server-only";

import { type DraftEmailResult, draftEmail } from "@/lib/ai/actions";
import { type StepInput, withStepLogging } from "@/lib/steps/step-handler";
import { type AiStepResult, runAi } from "./shared";

export type DraftEmailInput = StepInput & {
  aiRecipientName?: string;
  aiContext: string;
  aiGoal: string;
  aiTone?: string;
  aiSenderName?: string;
};

export function draftEmailStep(
  input: DraftEmailInput
): Promise<AiStepResult<DraftEmailResult>> {
  return withStepLogging(input, () =>
    runAi(() =>
      draftEmail({
        recipientName: input.aiRecipientName,
        context: input.aiContext,
        goal: input.aiGoal,
        tone: input.aiTone,
        senderName: input.aiSenderName,
      })
    )
  );
}

export const _integrationType = "ai";
