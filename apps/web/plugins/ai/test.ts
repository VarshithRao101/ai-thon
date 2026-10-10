import { isAiConfigured } from "@/lib/ai/provider";

export function testAi(_credentials: Record<string, string>) {
  return Promise.resolve(
    isAiConfigured()
      ? { success: true }
      : {
          success: false,
          error:
            "AI is not configured on this server (GOOGLE_GENERATIVE_AI_API_KEY, AI_MODEL_FAST)",
        }
  );
}
