import { z } from "zod";

/** Process roles that share one container image (docs/03). */
export type Role = "web" | "worker" | "scheduler" | "anchorer";

const hex32Bytes = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, "must be 64 hex characters (32 bytes)");
const evmAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x-prefixed 20-byte address");
const evmPrivateKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "must be a 0x-prefixed 32-byte hex key");
const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\/.+/, "must be a postgres:// connection URL");
const redisUrl = z
  .string()
  .regex(/^rediss?:\/\/.+/, "must be a redis:// or rediss:// URL");

const core = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: postgresUrl,
  // Owner connection for migrations and system jobs; the app role must not own tables.
  DATABASE_ADMIN_URL: postgresUrl.optional(),
  INTEGRATION_ENCRYPTION_KEY: hex32Bytes,
  REQUIRE_RLS: z.enum(["true", "false"]).default("false"),
});

const auth = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
});

const queue = z.object({
  REDIS_URL: redisUrl,
});

// Model names come from env only (CLAUDE.md hard rule); they become required in P2.
const ai = z.object({
  AI_PRIMARY_PROVIDER: z.enum(["google", "groq"]).default("google"),
  AI_MODEL_FAST: z.string().min(1).optional(),
  AI_MODEL_SMART: z.string().min(1).optional(),
  AI_FALLBACK_PROVIDER: z.enum(["google", "groq"]).optional(),
  AI_FALLBACK_MODEL: z.string().min(1).optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
});

const chain = z.object({
  CHAIN_ID: z.coerce.number().int().positive().default(31_337),
  CHAIN_RPC_URL: z.url(),
  ANCHOR_CONTRACT_ADDRESS: evmAddress,
  ANCHORER_PRIVATE_KEY: evmPrivateKey,
  EXPLORER_BASE_URL: z.url().optional(),
  ANCHOR_INTERVAL_MS: z.coerce.number().int().min(5000).default(30_000),
});

const roleSchemas = {
  web: core.extend(auth.shape).extend(ai.shape),
  worker: core.extend(queue.shape).extend(ai.shape),
  scheduler: core.extend(queue.shape),
  anchorer: core.extend(chain.shape),
} as const;

export type EnvFor<R extends Role> = z.infer<(typeof roleSchemas)[R]>;

/** Thrown when env is invalid. The message lists variable names, never values. */
export class EnvError extends Error {
  readonly problems: { variable: string; problem: string }[];

  constructor(role: Role, problems: { variable: string; problem: string }[]) {
    super(
      `Invalid environment for role "${role}":\n${problems
        .map((p) => `  - ${p.variable}: ${p.problem}`)
        .join("\n")}`
    );
    this.name = "EnvError";
    this.problems = problems;
  }
}

function describe(issue: z.core.$ZodIssue): string {
  if (issue.code === "invalid_type" && issue.input === undefined) {
    return "is required but not set";
  }
  // Custom regex messages are value-free; fall back to the issue code otherwise.
  return issue.code === "invalid_format" && issue.message
    ? issue.message
    : issue.code.replaceAll("_", " ");
}

/**
 * Validate the environment for one process role and return typed values.
 * Fails fast at boot so a misconfigured container never starts half-working.
 */
export function loadEnv<R extends Role>(
  role: R,
  source: Record<string, string | undefined> = process.env
): EnvFor<R> {
  // Treat empty strings as unset (common in .env files and CI secrets).
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== "")
  );
  const result = roleSchemas[role].safeParse(cleaned);
  if (!result.success) {
    throw new EnvError(
      role,
      result.error.issues.map((issue) => ({
        variable: issue.path.join(".") || "(root)",
        problem: describe(issue),
      }))
    );
  }
  return result.data as EnvFor<R>;
}
