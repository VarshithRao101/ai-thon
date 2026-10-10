/** The AI plugin uses platform keys from env (lib/ai/provider.ts), not per-workspace credentials. */
export type AiCredentials = Record<string, never>;
