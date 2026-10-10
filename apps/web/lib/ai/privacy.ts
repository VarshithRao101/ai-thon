/**
 * Privacy Shield (D-054): personal data never reaches the AI model.
 *
 * Before any AI call, emails, Indian phone numbers, Aadhaar numbers, PAN,
 * UPI IDs and card numbers are swapped for placeholders like [EMAIL_1]. The
 * model works on the placeholders; its answer is un-masked on our server, so
 * the workflow still gets the real values (an email still goes to the right
 * address). Every AI step reports what it hid, which is shown in run logs.
 *
 * Pure functions, no network, no storage: the mapping lives only for one call.
 * PRIVACY_SHIELD=off turns it off (not recommended).
 */

export type PiiKind = "email" | "upi" | "card" | "aadhaar" | "pan" | "phone";

export type PrivacyReport = {
  /** How many distinct values were hidden from the model. */
  masked: number;
  kinds: Partial<Record<PiiKind, number>>;
};

const DETECTORS: {
  kind: PiiKind;
  label: string;
  pattern: RegExp;
  valid?: (m: string) => boolean;
}[] = [
  {
    kind: "email",
    label: "EMAIL",
    pattern:
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
  },
  // UPI handles look like emails without a dot after the @ (name@okicici).
  {
    kind: "upi",
    label: "UPI",
    pattern: /\b[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}\b(?!\.)/g,
  },
  {
    kind: "card",
    label: "CARD",
    pattern: /\b(?:\d[ -]?){12,18}\d\b/g,
    valid: luhn,
  },
  {
    kind: "aadhaar",
    label: "AADHAAR",
    pattern: /(?<!\d[ -]?)[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}(?![ -]?\d)/g,
  },
  { kind: "pan", label: "PAN", pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  {
    kind: "phone",
    label: "PHONE",
    pattern: /(?<!\d)(?:\+?91[ -]?|0)?[6-9]\d{4}[ -]?\d{5}(?!\d)/g,
  },
];

const DIGITS = /\D/g;

function luhn(value: string): boolean {
  const digits = value.replace(DIGITS, "");
  if (digits.length < 13 || digits.length > 19) {
    return false;
  }
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits.at(-1 - i));
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) {
        d -= 9;
      }
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function shieldEnabled(): boolean {
  return process.env.PRIVACY_SHIELD !== "off";
}

export type Shield = {
  /** Replace personal data in `text` with placeholders. */
  mask: (text: string) => string;
  /** Put the real values back into model output. */
  unmask: (text: string) => string;
  /** Un-mask every string inside a value (objects, arrays). */
  unmaskDeep: <T>(value: T) => T;
  report: () => PrivacyReport;
};

const TOKEN = /\[(EMAIL|UPI|CARD|AADHAAR|PAN|PHONE)_(\d+)\]/gi;

export function createShield(): Shield {
  const byValue = new Map<string, string>();
  const byToken = new Map<string, string>();
  const counters: Partial<Record<PiiKind, number>> = {};
  const enabled = shieldEnabled();

  const mask = (text: string): string => {
    if (!(enabled && text)) {
      return text;
    }
    let out = text;
    for (const d of DETECTORS) {
      out = out.replace(d.pattern, (match) => {
        if (d.valid && !d.valid(match)) {
          return match;
        }
        const key = `${d.kind}:${match}`;
        const existing = byValue.get(key);
        if (existing) {
          return existing;
        }
        const n = (counters[d.kind] ?? 0) + 1;
        counters[d.kind] = n;
        const token = `[${d.label}_${n}]`;
        byValue.set(key, token);
        byToken.set(token.toUpperCase(), match);
        return token;
      });
    }
    return out;
  };

  const unmask = (text: string): string =>
    text ? text.replace(TOKEN, (t) => byToken.get(t.toUpperCase()) ?? t) : text;

  const unmaskDeep = <T>(value: T): T => {
    if (typeof value === "string") {
      return unmask(value) as T;
    }
    if (Array.isArray(value)) {
      return value.map((v) => unmaskDeep(v)) as T;
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          unmaskDeep(v),
        ])
      ) as T;
    }
    return value;
  };

  const report = (): PrivacyReport => ({
    masked: byToken.size,
    kinds: { ...counters },
  });

  return { mask, unmask, unmaskDeep, report };
}
