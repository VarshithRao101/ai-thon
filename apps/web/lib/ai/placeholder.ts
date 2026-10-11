/**
 * Made-up addresses a model writes when it has no real one
 * ("https://api.yourservice.com/…", "https://example.com/hook"). A step that
 * calls one can never work, so we never build or suggest them.
 */
const PLACEHOLDER_HOST =
  /(^|\.)(example\.(com|org|net)|your[-_]?[a-z0-9-]*\.[a-z.]+|placeholder[a-z0-9-]*\.[a-z.]+|api\.domain\.com|domain\.com|test\.com|foo\.(com|bar)|acme\.com)$/i;
const ANGLE_OR_BRACE = /[<>]|\{(?!\{)|\[[A-Z_]+\]/;

export function isPlaceholderUrl(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const text = value.trim();
  if (!text || text.includes("{{")) {
    return false;
  }
  if (ANGLE_OR_BRACE.test(text)) {
    return true;
  }
  try {
    return PLACEHOLDER_HOST.test(new URL(text).hostname);
  } catch {
    return false;
  }
}
