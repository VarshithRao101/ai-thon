import { z } from "zod";
import { DEFAULT_FIELDS } from "@/lib/forms/schema";

/**
 * Copilot plans (docs/09). The model fills a small, schema-validated plan; the
 * server turns it into canvas nodes and edges deterministically. That is far
 * more reliable on stage than asking a model to emit raw node JSON.
 */

/** Actions the Copilot may use, with the config keys it should fill. */
export const COPILOT_ACTIONS = {
  "ai/classify": {
    label: "AI Classify",
    use: "Sort text into one of a few labels (e.g. a track, hot/warm/cold lead)",
    config: {
      aiInput: "text to classify, usually a reference",
      aiLabels: "comma-separated labels",
      aiInstructions: "optional guidance",
    },
    outputs: ["label", "confidence", "reason"],
  },
  "ai/draft-email": {
    label: "AI Draft Email",
    use: "Write a short personal email from context and a goal",
    config: {
      aiRecipientName: "recipient name reference",
      aiContext: "facts about the recipient (references)",
      aiGoal: "what the email should achieve",
      aiTone:
        "one of: warm and professional | friendly and casual | formal | short and direct",
      aiSenderName: "who signs it",
    },
    outputs: ["subject", "body"],
  },
  "ai/extract": {
    label: "AI Extract Fields",
    use: "Pull named fields out of free text",
    config: { aiInput: "text", aiFields: "comma-separated field names" },
    outputs: ["<each field name>"],
  },
  "ai/generate": {
    label: "AI Generate Text",
    use: "Generate or summarise text",
    config: {
      aiPrompt: "the prompt, may include references",
      aiTone: "optional tone",
    },
    outputs: ["text"],
  },
  "google-sheets/append-row": {
    label: "Add Row to Sheet",
    use: "Append one row to a Google Sheet",
    config: {
      rowValues:
        "one cell value per line (use \\n between values), in column order",
    },
    outputs: ["rowNumber", "range"],
  },
  "smtp-email/send-email": {
    label: "Send Email",
    use: "Email anyone (Gmail)",
    config: {
      emailTo: "recipient address or reference",
      emailSubject: "subject",
      emailBody: "plain-text body",
    },
    outputs: ["messageId", "to"],
  },
  "telegram/send-message": {
    label: "Send Telegram Message",
    use: "Alert a Telegram group instantly",
    config: { telegramText: "message text" },
    outputs: ["messageId"],
  },
  Condition: {
    label: "Condition",
    use: "Continue only when an expression is true (e.g. {{classify.label}} === 'Hot')",
    config: {
      condition:
        "JavaScript comparison using references, strings in single quotes",
    },
    outputs: ["condition"],
  },
  Delay: {
    label: "Delay",
    use: "Wait before the next step (durable)",
    config: {
      delayMinutes: "number of minutes",
      delaySeconds: "number of seconds",
    },
    outputs: [],
  },
  "HTTP Request": {
    label: "HTTP Request",
    use: "Call an external API",
    config: {
      httpMethod: "GET|POST|PUT|PATCH|DELETE",
      endpoint: "https URL",
      httpBody: "JSON string",
    },
    outputs: ["data", "status"],
  },
} as const;

export type CopilotActionId = keyof typeof COPILOT_ACTIONS;

/** One action the Copilot may use. Other apps add theirs (lib/ai/plugin-catalog.ts). */
export type CatalogEntry = {
  label: string;
  use: string;
  config: Readonly<Record<string, string>>;
  outputs: readonly string[];
  /** Saved connection type this action needs, if any. */
  integration?: string;
  /** App name for "Connect …" notes. */
  app?: string;
};
export type Catalog = Readonly<Record<string, CatalogEntry>>;

/** The plan schema, limited to the built-in actions plus `extra`. */
export function makePlanSchema(extra: Catalog = {}) {
  const ids = [...Object.keys(COPILOT_ACTIONS), ...Object.keys(extra)] as [
    string,
    ...string[],
  ];
  return z.object({
    name: z.string().describe("Short workflow name, max 60 characters"),
    description: z.string().describe("One sentence"),
    trigger: z.object({
      type: z.enum(["Form", "Webhook", "Schedule", "Manual"]),
      formTitle: z
        .string()
        .optional()
        .describe("Form title (Form trigger only)"),
      formFields: z
        .array(
          z.object({
            key: z.string().describe("camelCase key, e.g. email"),
            label: z.string(),
            type: z.enum([
              "text",
              "email",
              "phone",
              "number",
              "textarea",
              "select",
            ]),
            required: z.boolean(),
            options: z
              .string()
              .optional()
              .describe("comma-separated choices for select"),
          })
        )
        .optional(),
      scheduleCron: z
        .string()
        .optional()
        .describe("5-field cron in IST, e.g. 0 9 * * *"),
    }),
    steps: z
      .array(
        z.object({
          id: z.string().describe("short snake_case id, unique, e.g. classify"),
          action: z.enum(ids),
          label: z.string().describe("Short display label"),
          config: z.array(z.object({ key: z.string(), value: z.string() })),
          after: z
            .array(z.string())
            .optional()
            .describe(
              "ids of steps this one runs after; 'trigger' for the first. Omit to run after the previous step"
            ),
        })
      )
      .min(1)
      .max(10),
  });
}

export const planSchema = makePlanSchema();

export type CopilotPlan = z.infer<typeof planSchema>;

/** The catalog as compact text for the system prompt. */
export function catalogPrompt(extra: Catalog = {}): string {
  return Object.entries({ ...COPILOT_ACTIONS, ...extra } as Catalog)
    .map(([id, a]) => {
      const keys = Object.entries(a.config)
        .map(([k, v]) => `${k}: ${v}`)
        .join("; ");
      return `- ${id} — ${a.use}. config { ${keys} }. outputs: ${a.outputs.join(", ") || "none"}`;
    })
    .join("\n");
}

type CanvasNode = {
  id: string;
  type: "trigger" | "action";
  position: { x: number; y: number };
  data: {
    label: string;
    description: string;
    type: "trigger" | "action";
    config: Record<string, unknown>;
    status: "idle";
  };
};
type CanvasEdge = { id: string; source: string; target: string; type: string };

export type BuiltWorkflow = {
  name: string;
  description: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  /** Things the builder fixed or could not resolve. */
  notes: string[];
};

const FIELD_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
const NON_ID_CHARS = /[^a-z0-9_]/g;
const LEADING_NON_LETTERS = /^[^a-z]+/;
const STEP_ID = /^[a-z][a-z0-9_]{0,23}$/;
const REF = /\{\{\s*([a-zA-Z_][\w]*)\.([\w.]+)\s*\}\}/g;
const CONNECTED_ACTIONS: Record<string, string> = {
  "google-sheets/append-row": "google-sheets",
  "smtp-email/send-email": "smtp-email",
  "telegram/send-message": "telegram",
};

// Trigger outputs that exist without a form field (see lib/hive/runner.ts).
const TRIGGER_BUILTINS = new Set([
  "submittedAt",
  "runId",
  "timestamp",
  "triggered",
  "trigger",
  "consent",
  "submissionId",
]);
const CAMEL_BREAK = /([a-z0-9])([A-Z])/g;
const NUMBER_KEY = /(amount|budget|age|count|number|quantity)/;
const LONG_TEXT_KEY =
  /(message|idea|details|description|feedback|notes|about|experience|summary)/;
const UNDERSCORES = /_+/g;

type PlanField = NonNullable<CopilotPlan["trigger"]["formFields"]>[number];

/** A form field for a key a step references but the plan forgot to ask for. */
function fieldFor(key: string): PlanField {
  const words = key
    .replace(CAMEL_BREAK, "$1 $2")
    .replace(UNDERSCORES, " ")
    .trim();
  const label = words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
  const lower = key.toLowerCase();
  let type: PlanField["type"] = "text";
  if (lower.includes("email")) {
    type = "email";
  } else if (lower.includes("phone") || lower.includes("mobile")) {
    type = "phone";
  } else if (NUMBER_KEY.test(lower)) {
    type = "number";
  } else if (LONG_TEXT_KEY.test(lower)) {
    type = "textarea";
  }
  return { key, label, type, required: type === "email" };
}

/**
 * The form must ask for every field the steps use: add any referenced key that
 * is missing (a model often writes {{trigger.fullName}} but asks for "name").
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one scan over every step value
function reconcileFormFields(plan: CopilotPlan, notes: string[]): PlanField[] {
  const fields = (plan.trigger.formFields ?? []).filter((f) =>
    FIELD_KEY.test(f.key)
  );
  const base =
    fields.length > 0 ? fields : [...(DEFAULT_FIELDS as PlanField[])];
  const have = new Set(base.map((f) => f.key));
  const added: string[] = [];
  for (const step of plan.steps) {
    for (const { value } of step.config) {
      for (const match of value.matchAll(REF)) {
        const [, ref, path] = match;
        const key = (path ?? "").split(".")[0] ?? "";
        if (
          ref === "trigger" &&
          FIELD_KEY.test(key) &&
          !have.has(key) &&
          !TRIGGER_BUILTINS.has(key)
        ) {
          have.add(key);
          base.push(fieldFor(key));
          added.push(key);
        }
      }
    }
  }
  if (added.length > 0) {
    notes.push(`Added form fields the steps use: ${added.join(", ")}`);
  }
  return base;
}

function rand(): string {
  return Math.random().toString(36).slice(2, 6);
}

function cleanId(raw: string, taken: Set<string>): string {
  let id =
    raw
      .toLowerCase()
      .replace(NON_ID_CHARS, "_")
      .replace(LEADING_NON_LETTERS, "")
      .slice(0, 24) || "step";
  if (!STEP_ID.test(id)) {
    id = "step";
  }
  let unique = id;
  let n = 2;
  while (taken.has(unique) || unique === "trigger") {
    unique = `${id}_${n}`;
    n += 1;
  }
  taken.add(unique);
  return unique;
}

/**
 * Turn a plan into canvas nodes/edges: unique ids, references rewritten to the
 * builder's {{@nodeId:Label.field}} syntax, connections filled in, a layered
 * left-to-right layout, and saved connections attached where available.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a single deterministic pass (ids, edges, references, layout); splitting it hides the order
export function buildWorkflow(
  plan: CopilotPlan,
  connections: Partial<Record<string, string>> = {},
  extra: Catalog = {}
): BuiltWorkflow {
  const catalog: Catalog = { ...COPILOT_ACTIONS, ...extra };
  const entry = (action: string) => catalog[action] as CatalogEntry;
  const notes: string[] = [];
  const suffix = rand();
  const triggerId = `trigger_${suffix}`;
  const triggerLabel =
    plan.trigger.type === "Form" ? "Form" : plan.trigger.type;

  // Step ids (as the plan names them) → canvas node ids and labels.
  const taken = new Set<string>();
  const steps = plan.steps
    .filter((s) => s.action in catalog)
    .map((s) => ({ ...s, cleanId: cleanId(s.id, taken) }));
  const originalToClean = new Map<string, string>();
  plan.steps.forEach((s, i) => {
    const step = steps[i];
    if (step) {
      originalToClean.set(s.id, step.cleanId);
    }
  });
  const nodeIdOf = new Map<string, string>([["trigger", triggerId]]);
  const labelOf = new Map<string, string>([["trigger", triggerLabel]]);
  for (const s of steps) {
    nodeIdOf.set(s.cleanId, `${s.cleanId}_${suffix}`);
    labelOf.set(s.cleanId, s.label || entry(s.action).label);
  }

  const rewrite = (value: string, upstream: Set<string>): string =>
    value.replace(REF, (_match, ref: string, field: string) => {
      const key =
        ref === "trigger" ? "trigger" : (originalToClean.get(ref) ?? ref);
      const nodeId = nodeIdOf.get(key);
      if (!(nodeId && upstream.has(key))) {
        notes.push(
          `Removed a reference to "${ref}" that is not an earlier step`
        );
        return "";
      }
      return `{{@${nodeId}:${labelOf.get(key)}.${field}}}`;
    });

  // Edges: explicit "after", else the previous step (trigger for the first).
  const parents = new Map<string, string[]>();
  steps.forEach((s, i) => {
    const declared = (s.after ?? [])
      .map((a) => (a === "trigger" ? "trigger" : originalToClean.get(a)))
      .filter((a): a is string => Boolean(a) && a !== s.cleanId);
    const earlier = new Set([
      "trigger",
      ...steps.slice(0, i).map((p) => p.cleanId),
    ]);
    const valid = declared.filter((a) => earlier.has(a));
    if (declared.length !== valid.length) {
      notes.push(
        `"${s.label}" pointed at a later step; connected it in order instead`
      );
    }
    const fallback = i === 0 ? "trigger" : (steps[i - 1]?.cleanId ?? "trigger");
    parents.set(s.cleanId, valid.length > 0 ? valid : [fallback]);
  });

  // Ancestors for reference checks, and depth for layout.
  const ancestors = new Map<string, Set<string>>([["trigger", new Set()]]);
  const depth = new Map<string, number>([["trigger", 0]]);
  for (const s of steps) {
    const set = new Set<string>();
    let d = 0;
    for (const p of parents.get(s.cleanId) ?? []) {
      set.add(p);
      for (const a of ancestors.get(p) ?? []) {
        set.add(a);
      }
      d = Math.max(d, (depth.get(p) ?? 0) + 1);
    }
    ancestors.set(s.cleanId, set);
    depth.set(s.cleanId, d);
  }

  const triggerConfig: Record<string, unknown> = {
    triggerType: plan.trigger.type,
  };
  if (plan.trigger.type === "Form") {
    triggerConfig.formTitle = plan.trigger.formTitle || plan.name;
    triggerConfig.formFields = JSON.stringify(reconcileFormFields(plan, notes));
  }
  if (plan.trigger.type === "Schedule") {
    triggerConfig.scheduleCron = plan.trigger.scheduleCron || "0 9 * * *";
    triggerConfig.scheduleTimezone = "Asia/Kolkata";
  }

  const columns = new Map<number, string[]>();
  for (const [key, d] of depth) {
    columns.set(d, [...(columns.get(d) ?? []), key]);
  }
  const position = (key: string) => {
    const d = depth.get(key) ?? 0;
    const column = columns.get(d) ?? [key];
    const index = column.indexOf(key);
    return {
      x: 100 + d * 280,
      y: 200 + (index - (column.length - 1) / 2) * 230,
    };
  };

  const nodes: CanvasNode[] = [
    {
      id: triggerId,
      type: "trigger",
      position: position("trigger"),
      data: {
        label: triggerLabel,
        description: "",
        type: "trigger",
        config: triggerConfig,
        status: "idle",
      },
    },
  ];
  for (const s of steps) {
    const upstream = ancestors.get(s.cleanId) ?? new Set<string>();
    const config: Record<string, unknown> = { actionType: s.action };
    for (const { key, value } of s.config) {
      if (key in entry(s.action).config) {
        config[key] = rewrite(value.replace(/\\n/g, "\n"), upstream);
      }
    }
    const integration =
      CONNECTED_ACTIONS[s.action] ?? entry(s.action).integration;
    if (integration && connections[integration]) {
      config.integrationId = connections[integration];
    } else if (integration) {
      notes.push(
        `Connect ${entry(s.action).app ?? entry(s.action).label} before running (Connections)`
      );
    }
    nodes.push({
      id: nodeIdOf.get(s.cleanId) as string,
      type: "action",
      position: position(s.cleanId),
      data: {
        label: labelOf.get(s.cleanId) as string,
        description: entry(s.action).use,
        type: "action",
        config,
        status: "idle",
      },
    });
  }

  const edges: CanvasEdge[] = [];
  for (const s of steps) {
    for (const p of parents.get(s.cleanId) ?? []) {
      const source = nodeIdOf.get(p) as string;
      const target = nodeIdOf.get(s.cleanId) as string;
      edges.push({
        id: `e_${source}_${target}`,
        source,
        target,
        type: "animated",
      });
    }
  }

  return {
    name: plan.name.slice(0, 60) || "New automation",
    description: plan.description.slice(0, 200),
    nodes,
    edges,
    notes: [...new Set(notes)],
  };
}
