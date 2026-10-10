/**
 * Hosted form definitions (docs/02 "Form Submitted" trigger). Shared by the
 * builder UI, the public page and the submission API. Stored on the trigger
 * node's config as JSON strings, because node config values are strings.
 */

export type FormFieldType =
  | "text"
  | "email"
  | "phone"
  | "number"
  | "textarea"
  | "select";

export type FormField = {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder?: string;
  /** Comma-separated choices for "select". */
  options?: string;
};

export type FormDefinition = {
  title: string;
  description: string;
  submitMessage: string;
  consentText: string;
  fields: FormField[];
};

export const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "number", label: "Number" },
  { value: "textarea", label: "Long text" },
  { value: "select", label: "Dropdown" },
];

export const DEFAULT_FIELDS: FormField[] = [
  { key: "name", label: "Full name", type: "text", required: true },
  { key: "email", label: "Email", type: "email", required: true },
  { key: "college", label: "College", type: "text", required: true },
  {
    key: "idea",
    label: "What do you want to build?",
    type: "textarea",
    required: true,
    placeholder: "One or two lines about your idea",
  },
];

export const DEFAULT_CONSENT =
  "I agree that my answers are processed to handle this registration, as described in the privacy notice.";

const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
const MAX_FIELDS = 20;
const TYPES = new Set(FIELD_TYPES.map((t) => t.value));

const NON_WORD = /[^a-zA-Z0-9 ]+/g;
const WHITESPACE = /\s+/;
const NAME_LABEL = /name/i;

/** "What do you want to build?" → "whatDoYouWantToBuild" */
export function fieldKeyFrom(label: string): string {
  const words = label
    .normalize("NFKD")
    .replace(NON_WORD, " ")
    .trim()
    .split(WHITESPACE)
    .filter(Boolean)
    .slice(0, 5);
  const key = words
    .map((w, i) =>
      i === 0 ? w.toLowerCase() : w[0]?.toUpperCase() + w.slice(1).toLowerCase()
    )
    .join("");
  return KEY_PATTERN.test(key) ? key : `field${Math.abs(hash(label)) % 1000}`;
}

function hash(text: string): number {
  let h = 0;
  for (const c of text) {
    h = (h * 31 + c.charCodeAt(0)) % 1_000_003;
  }
  return h;
}

/** One stored field, cleaned; null when it is unusable. */
function toField(item: unknown): FormField | null {
  const f = item as Partial<FormField>;
  const label = String(f.label ?? "")
    .trim()
    .slice(0, 120);
  const key = String(f.key ?? "").trim();
  if (!(label && KEY_PATTERN.test(key))) {
    return null;
  }
  return {
    key,
    label,
    type: TYPES.has(f.type as FormFieldType)
      ? (f.type as FormFieldType)
      : "text",
    required: f.required === true,
    ...(f.placeholder
      ? { placeholder: String(f.placeholder).slice(0, 120) }
      : {}),
    ...(f.options ? { options: String(f.options).slice(0, 500) } : {}),
  };
}

export function parseFields(raw: unknown): FormField[] {
  if (typeof raw !== "string" || !raw.trim()) {
    return DEFAULT_FIELDS;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_FIELDS;
  }
  if (!Array.isArray(parsed)) {
    return DEFAULT_FIELDS;
  }
  const seen = new Set<string>();
  const fields: FormField[] = [];
  for (const item of parsed.slice(0, MAX_FIELDS)) {
    const field = toField(item);
    if (field && !seen.has(field.key)) {
      seen.add(field.key);
      fields.push(field);
    }
  }
  return fields;
}

/** Read a form definition from a Form trigger's config. */
export function formFromConfig(
  config: Record<string, unknown>
): FormDefinition {
  const str = (key: string, fallback: string) => {
    const value = config[key];
    return typeof value === "string" ? value : fallback;
  };
  return {
    title: str("formTitle", "Registration").slice(0, 120) || "Registration",
    description: str("formDescription", "").slice(0, 600),
    submitMessage:
      str("formSubmitMessage", "Thanks! Your response is recorded.").slice(
        0,
        300
      ) || "Thanks! Your response is recorded.",
    consentText: str("formConsentText", DEFAULT_CONSENT).slice(0, 400),
    fields: parseFields(config.formFields),
  };
}

export function optionsOf(field: FormField): string[] {
  return (field.options ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const PHONE = /^[+()\-\s\d]{7,20}$/;
const MAX_TEXT = 200;
const MAX_LONG_TEXT = 2000;

export type SubmissionResult =
  | { ok: true; values: Record<string, string> }
  | { ok: false; errors: Record<string, string> };

/** The problem with one non-empty answer, or null. */
function fieldError(field: FormField, value: string): string | null {
  const max = field.type === "textarea" ? MAX_LONG_TEXT : MAX_TEXT;
  if (value.length > max) {
    return `Keep it under ${max} characters`;
  }
  const checks: Partial<Record<FormFieldType, [() => boolean, string]>> = {
    email: [() => EMAIL.test(value), "Enter a valid email"],
    phone: [() => PHONE.test(value), "Enter a valid phone number"],
    number: [() => Number.isFinite(Number(value)), "Enter a number"],
    select: [() => optionsOf(field).includes(value), "Pick one of the options"],
  };
  const check = checks[field.type];
  return check && !check[0]() ? check[1] : null;
}

/** Validate a submission against the form. Unknown keys are dropped. */
export function validateSubmission(
  form: FormDefinition,
  body: Record<string, unknown>
): SubmissionResult {
  const values: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const field of form.fields) {
    const raw = body[field.key];
    const value =
      typeof raw === "string" || typeof raw === "number"
        ? String(raw).trim()
        : "";
    if (!value) {
      if (field.required) {
        errors[field.key] = "Required";
      }
      continue;
    }
    const problem = fieldError(field, value);
    if (problem) {
      errors[field.key] = problem;
    }
    values[field.key] = value;
  }
  if (form.consentText && body.consent !== true) {
    errors.consent = "Please agree to continue";
  }
  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, values };
}

/** IST timestamp shown in Sheets and emails, e.g. "09 Oct 2026, 7:42 pm". */
export function submittedAtIst(date = new Date()): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

const SAMPLE_BY_TYPE: Partial<Record<FormFieldType, string>> = {
  email: "test.participant@example.test",
  phone: "+91 90000 00000",
  number: "3",
};

function sampleFor(field: FormField): string {
  const byType = SAMPLE_BY_TYPE[field.type];
  if (byType) {
    return byType;
  }
  if (field.type === "select") {
    return optionsOf(field)[0] ?? "";
  }
  if (field.key === "name" || NAME_LABEL.test(field.label)) {
    return "Test Participant";
  }
  if (field.type === "textarea") {
    return "An AI assistant that helps farmers price their crops";
  }
  return `Sample ${field.label.toLowerCase()}`;
}

/** Example values for a manual test run of a form workflow. */
export function sampleSubmission(form: FormDefinition): Record<string, string> {
  return Object.fromEntries(
    form.fields.map((field) => [field.key, sampleFor(field)])
  );
}
