import { validateConditionExpression } from "@/lib/condition-validator";
import { DEFAULT_FIELDS } from "@/lib/forms/schema";
import type { Catalog, CopilotPlan } from "./plan";

/**
 * Plan repair (D-058): models make small, predictable slips. Fix the ones we
 * can fix for certain, and name the rest in a note, before anything reaches
 * the canvas. Works on the plan as the model wrote it ({{trigger.x}},
 * {{stepId.field}}), before ids are rewritten.
 */

type Step = CopilotPlan["steps"][number];

const REF = /\{\{\s*([a-zA-Z_][\w]*)\.([\w.]+)\s*\}\}/g;
const ONLY_REFS_OR_EMAIL =
  /^\s*(\{\{\s*[a-zA-Z_][\w]*\.[\w.]+\s*\}\}|[^\s@,]+@[^\s@,]+\.[^\s@,]+)(\s*,\s*(\{\{\s*[a-zA-Z_][\w]*\.[\w.]+\s*\}\}|[^\s@,]+@[^\s@,]+\.[^\s@,]+))*\s*$/;
const QUOTED = /'([^']*)'|"([^"]*)"/g;
const LOOSE_EQ = /([^=!<>])==(?!=)/g;
const LOOSE_NE = /!=(?!=)/g;
const WORD_AND = /\s+and\s+/gi;
const WORD_OR = /\s+or\s+/gi;
const LABEL_COMPARE =
  /\{\{\s*([a-zA-Z_][\w]*)\.label\s*\}\}\s*(===|!==)\s*(['"])([^'"]*)\3/g;
const NUMBER = /(\d+(?:\.\d+)?)/;
const HOURS = /hour|hr/i;
const DAYS = /day/i;

// Outputs a model often names differently from what the step returns.
const OUTPUT_ALIASES: Record<string, Record<string, string>> = {
  "ai/classify": {
    category: "label",
    class: "label",
    result: "label",
    track: "label",
    priority: "label",
    sentiment: "label",
    output: "label",
    value: "label",
    score: "label",
  },
  "ai/draft-email": {
    emailBody: "body",
    content: "body",
    text: "body",
    message: "body",
    emailSubject: "subject",
    title: "subject",
  },
  "ai/generate": {
    output: "text",
    result: "text",
    content: "text",
    summary: "text",
    message: "text",
    body: "text",
  },
};

const get = (step: Step, key: string) =>
  step.config.find((c) => c.key === key)?.value ?? "";

function set(step: Step, key: string, value: string) {
  const found = step.config.find((c) => c.key === key);
  if (found) {
    found.value = value;
  } else {
    step.config.push({ key, value });
  }
}

/** Apply `fn` to every config value of a step. */
function mapValues(step: Step, fn: (value: string) => string) {
  for (const c of step.config) {
    c.value = fn(c.value);
  }
}

type Field = { key: string; type: string };

/** The form's fields; the builder uses the default form when the plan gives none. */
function formFields(plan: CopilotPlan): Field[] {
  const given = plan.trigger.formFields ?? [];
  return given.length > 0 ? given : (DEFAULT_FIELDS as Field[]);
}

function formFieldKeys(plan: CopilotPlan): string[] {
  return formFields(plan).map((f) => f.key);
}

function emailFieldKey(plan: CopilotPlan): string | null {
  const fields = formFields(plan);
  return (
    fields.find((f) => f.type === "email")?.key ??
    fields.find((f) => f.key.toLowerCase().includes("email"))?.key ??
    null
  );
}

/** The right output name for {{ref.field}}, or null when it is fine or unknown. */
function outputFix(action: string, field: string, catalog: Catalog) {
  const outputs = catalog[action]?.outputs ?? [];
  if (
    outputs.length === 0 ||
    outputs.some((o) => o.startsWith("<")) ||
    outputs.includes(field)
  ) {
    return { ok: true as const };
  }
  const alias = OUTPUT_ALIASES[action]?.[field];
  return alias ? { ok: true as const, alias } : { ok: false as const };
}

/** {{a.b}} → {{a.<right output>}} when the step returns a fixed set of outputs. */
function fixOutputNames(
  plan: CopilotPlan,
  catalog: Catalog,
  notes: string[]
): void {
  const actionOf = new Map(plan.steps.map((s) => [s.id, s.action]));
  for (const step of plan.steps) {
    mapValues(step, (value) =>
      value.replace(REF, (match, ref: string, path: string) => {
        const action = actionOf.get(ref);
        const field = path.split(".")[0] ?? "";
        if (!action) {
          return match;
        }
        const fix = outputFix(action, field, catalog);
        if (fix.ok) {
          return fix.alias ? `{{${ref}.${fix.alias}}}` : match;
        }
        notes.push(
          `"${step.label}" uses ${ref}.${field}, which that step doesn't produce`
        );
        return match;
      })
    );
  }
}

const loosen = (code: string) =>
  code
    .replace(LOOSE_EQ, "$1===")
    .replace(LOOSE_NE, "!==")
    .replace(WORD_AND, " && ")
    .replace(WORD_OR, " || ");

/** == → ===, != → !==, and/or → &&/||, never inside quoted text. */
function strictOperators(expr: string): string {
  const parts: string[] = [];
  let last = 0;
  for (const m of expr.matchAll(QUOTED)) {
    parts.push(loosen(expr.slice(last, m.index)), m[0]);
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(loosen(expr.slice(last)));
  return parts.join("");
}

function classifierLabels(plan: CopilotPlan): Map<string, string[]> {
  const labelsOf = new Map<string, string[]>();
  for (const s of plan.steps) {
    if (s.action === "ai/classify") {
      labelsOf.set(
        s.id,
        get(s, "aiLabels")
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean)
      );
    }
  }
  return labelsOf;
}

/** A compared label must be one of the classifier's own labels, same case. */
function exactLabels(
  expr: string,
  labelsOf: Map<string, string[]>,
  onMiss: (text: string, ref: string, labels: string[]) => void
): string {
  return expr.replace(LABEL_COMPARE, (...groups: string[]) => {
    const [match = "", ref = "", op = "", quote = "", text = ""] = groups;
    const labels = labelsOf.get(ref);
    if (!labels) {
      return match;
    }
    const wanted = text.trim().toLowerCase();
    const exact =
      labels.find((l) => l === text) ??
      labels.find((l) => l.toLowerCase() === wanted);
    if (!exact) {
      onMiss(text, ref, labels);
      return match;
    }
    return `{{${ref}.label}} ${op} ${quote}${exact}${quote}`;
  });
}

function readable(expr: string): boolean {
  let n = 0;
  const probe = expr.replace(REF, () => {
    n += 1;
    return `__v${n}`;
  });
  return validateConditionExpression(probe).valid;
}

/** Write conditions the way the engine accepts them, with exact labels. */
function fixConditions(plan: CopilotPlan, notes: string[]): void {
  const labelsOf = classifierLabels(plan);
  for (const step of plan.steps.filter((s) => s.action === "Condition")) {
    const raw = get(step, "condition").trim();
    if (!raw) {
      notes.push(`"${step.label}" has no condition yet`);
      continue;
    }
    const expr = exactLabels(strictOperators(raw), labelsOf, (text, ref, l) =>
      notes.push(
        `"${step.label}" checks for "${text}", which is not one of ${ref}'s labels (${l.join(", ")})`
      )
    );
    set(step, "condition", expr);
    if (!readable(expr)) {
      notes.push(`"${step.label}" has a condition ZETA can't read: ${expr}`);
    }
  }
}

type Ctx = {
  plan: CopilotPlan;
  notes: string[];
  emailKey: string | null;
  fields: string[];
  isForm: boolean;
  /** An AI Draft Email step that runs before this one, if any. */
  draft?: Step;
};

function fixEmail(step: Step, c: Ctx) {
  const to = get(step, "emailTo");
  if (!ONLY_REFS_OR_EMAIL.test(to)) {
    if (c.emailKey) {
      set(step, "emailTo", `{{trigger.${c.emailKey}}}`);
      if (to) {
        c.notes.push(`"${step.label}" now goes to the form's email address`);
      }
    } else {
      c.notes.push(`"${step.label}" needs a recipient email address`);
    }
  }
  if (!get(step, "emailSubject").trim()) {
    set(
      step,
      "emailSubject",
      c.draft ? `{{${c.draft.id}.subject}}` : c.plan.name
    );
  }
  if (!get(step, "emailBody").trim()) {
    if (c.draft) {
      set(step, "emailBody", `{{${c.draft.id}.body}}`);
    } else {
      c.notes.push(`"${step.label}" has an empty message`);
    }
  }
}

function fixSheet(step: Step, c: Ctx) {
  if (get(step, "rowValues").trim()) {
    return;
  }
  const cells = [
    ...(c.isForm ? ["{{trigger.submittedAt}}"] : []),
    ...c.fields.map((k) => `{{trigger.${k}}}`),
  ];
  if (cells.length > 0) {
    set(step, "rowValues", cells.join("\\n"));
  } else {
    c.notes.push(`"${step.label}" has no columns to add`);
  }
}

function fixTelegram(step: Step, c: Ctx) {
  if (get(step, "telegramText").trim()) {
    return;
  }
  const lines = c.fields
    .slice(0, 4)
    .map((k) => `${k}: {{trigger.${k}}}`)
    .join("\\n");
  set(step, "telegramText", `${c.plan.name}${lines ? `\\n${lines}` : ""}`);
}

const firstNumber = (v: string) => Number(v.match(NUMBER)?.[1] ?? Number.NaN);
const positive = (n: number) => Number.isFinite(n) && n > 0;

function fixDelay(step: Step, c: Ctx) {
  const minutesText = get(step, "delayMinutes");
  const secondsText = get(step, "delaySeconds");
  let minutes = firstNumber(minutesText);
  if (HOURS.test(minutesText)) {
    minutes *= 60;
  } else if (DAYS.test(minutesText)) {
    minutes *= 1440;
  }
  const seconds = firstNumber(secondsText);
  if (minutesText || positive(minutes)) {
    set(
      step,
      "delayMinutes",
      positive(minutes) ? String(Math.round(minutes)) : ""
    );
  }
  if (secondsText || positive(seconds)) {
    set(
      step,
      "delaySeconds",
      positive(seconds) ? String(Math.round(seconds)) : ""
    );
  }
  if (!(positive(minutes) || positive(seconds))) {
    set(step, "delayMinutes", "1");
    c.notes.push(`"${step.label}" had no wait time; set to 1 minute`);
  }
}

function fixClassify(step: Step, c: Ctx) {
  if (!get(step, "aiLabels").trim()) {
    c.notes.push(`"${step.label}" needs the labels to choose from`);
  }
  if (!get(step, "aiInput").trim() && c.fields.length > 0) {
    set(
      step,
      "aiInput",
      c.fields.map((k) => `${k}: {{trigger.${k}}}`).join("\\n")
    );
  }
}

const FIXERS: Record<string, (step: Step, c: Ctx) => void> = {
  "smtp-email/send-email": fixEmail,
  "google-sheets/append-row": fixSheet,
  "telegram/send-message": fixTelegram,
  Delay: fixDelay,
  "ai/classify": fixClassify,
};

/** Email, Sheets, Telegram, Delay, AI steps: fill what is missing, safely. */
function fixActionInputs(plan: CopilotPlan, notes: string[]): void {
  const isForm = plan.trigger.type === "Form";
  const base: Ctx = {
    plan,
    notes,
    isForm,
    emailKey: isForm ? emailFieldKey(plan) : null,
    fields: isForm ? formFieldKeys(plan) : [],
  };
  let draft: Step | undefined;
  for (const step of plan.steps) {
    FIXERS[step.action]?.(step, { ...base, draft });
    if (step.action === "ai/draft-email") {
      draft = step;
    }
  }
}

/** A repaired copy of the plan (templates are shared, never edit them in place). */
export function repairPlan(
  input: CopilotPlan,
  catalog: Catalog,
  notes: string[]
): CopilotPlan {
  const plan = structuredClone(input);
  fixOutputNames(plan, catalog, notes);
  fixConditions(plan, notes);
  fixActionInputs(plan, notes);
  return plan;
}
