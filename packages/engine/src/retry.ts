import type { ErrorClass, RetryPolicy, StepError } from "./types";

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
};

/**
 * Exponential backoff with full jitter (AWS architecture blog): a random delay
 * in [0, min(max, base * 2^(attempt-1))]. A server-provided Retry-After wins
 * if it is longer.
 */
export function backoffDelay(
  attempt: number,
  policy: RetryPolicy,
  random: () => number,
  retryAfterMs?: number
): number {
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const jittered = Math.floor(random() * ceiling);
  return Math.max(jittered, retryAfterMs ?? 0);
}

export function shouldRetry(error: StepError, attempt: number, policy: RetryPolicy): boolean {
  return error.class === "retryable" && attempt < policy.maxAttempts;
}

const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

/**
 * Classify an exception thrown by a step (as opposed to a step that returned a
 * structured error). Timeouts and network failures are transient; anything
 * else is fatal so side effects are never blindly repeated.
 */
export function classifyThrown(error: unknown): StepError {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  const code = (error as { code?: unknown; cause?: { code?: unknown } } | null)?.code ??
    (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  let cls: ErrorClass = "fatal";
  if (
    name === "AbortError" ||
    name === "TimeoutError" ||
    (typeof code === "string" && RETRYABLE_ERROR_CODES.has(code)) ||
    message === "fetch failed"
  ) {
    cls = "retryable";
  }
  return { message, class: cls };
}

/** Map an HTTP status to an error class (used by integrations that call APIs). */
export function classifyHttpStatus(status: number): ErrorClass {
  if (status === 429 || status === 408 || status >= 500) {
    return "retryable";
  }
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status >= 400) {
    return "validation";
  }
  return "fatal";
}

/** Parse a Retry-After header (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) {
    return;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}
