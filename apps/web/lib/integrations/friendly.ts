/**
 * Connection test errors in plain words. Providers answer with raw JSON,
 * "HTTP 404" or codes like "invalid_auth"; people need to know what to do.
 */
const JSON_BLOCK = /\{[\s\S]*\}/;
const AUTH = /\b(401|403)\b|invalid_auth|unauthori[sz]ed|forbidden|not_authed/i;
const NOT_FOUND = /\b404\b|not[ _]found/i;
const BAD_REQUEST = /\b400\b|bad request|validation failed/i;
const RATE = /\b429\b|rate.?limit|too many/i;
const TECHNICAL = /^(HTTP \d+|API validation failed|[a-z_]+$)/i;
const PLAIN_KEY_ERROR = /invalid (api )?(key|token)|is invalid/i;

function extract(raw: string): string {
  const match = raw.match(JSON_BLOCK);
  if (!match) {
    return raw;
  }
  try {
    const body = JSON.parse(match[0]) as {
      error?: string | { message?: string };
      message?: string;
    };
    const inner =
      typeof body.error === "string" ? body.error : body.error?.message;
    return inner || body.message || raw;
  } catch {
    return raw;
  }
}

export function friendlyTestError(app: string, raw: string): string {
  const text = extract(raw.trim()).trim();
  if (RATE.test(text)) {
    return `${app} is limiting requests right now. Wait a minute and test again.`;
  }
  if (PLAIN_KEY_ERROR.test(text) || AUTH.test(text)) {
    return `${app} rejected this key. Copy the whole key again and check it is still active.`;
  }
  if (NOT_FOUND.test(text) && TECHNICAL.test(text)) {
    return `${app} didn't recognise this key. Check you copied the right one.`;
  }
  if (BAD_REQUEST.test(text) && TECHNICAL.test(text)) {
    return `${app} refused the details. Check the key and the other fields.`;
  }
  return text || `Could not reach ${app}. Try again.`;
}
