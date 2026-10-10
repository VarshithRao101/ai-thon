/**
 * Copilot accuracy eval (PLAN.md, Block C): runs every prompt in
 * eval/copilot-golden.json through the real model (planWorkflow), builds the
 * canvas exactly like /api/ai/generate does, and scores each workflow on
 * structure AND wiring: the right trigger, the right steps in the right order,
 * a valid graph, references that point at real fields, emails addressed to
 * the form's email field, conditions on the classifier's own labels, …
 *
 *   pnpm --filter @flowledger/web eval:copilot [--only id1,id2]
 *
 * Writes eval/results/copilot-latest.{json,md}. Needs the AI keys in .env.local.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

type Case = {
  id: string;
  prompt: string;
  existing?: string;
  trigger: string;
  require?: string[];
  requireAny?: string[][];
  forbid?: string[];
  minCount?: Record<string, number>;
  order?: [string, string][];
  cron?: string;
  emailToForm?: boolean;
  emailUsesDraft?: boolean;
  conditionOnClassify?: boolean;
  sheetUsesStep?: string;
  httpEndpoint?: string;
};

type Node = {
  id: string;
  type: string;
  data: { label: string; config: Record<string, unknown> };
};
type Edge = { source: string; target: string };

const ROOT = resolve(process.cwd(), "..", "..");
const LIST_SPLIT = /[,\n]/;
const EMAIL_KEY = /email/i;
const QUOTED = /'([^']+)'|"([^"]+)"/g;
const REF = /\{\{@([^:}]+):[^.}]*\.([\w.]+)\}\}/g;
const TRIGGER_OUTPUTS = new Set([
  "submittedAt",
  "runId",
  "verifyUrl",
  "timestamp",
  "triggered",
  "trigger",
  "consent",
  "submissionId",
]);

function refsIn(value: unknown): { nodeId: string; field: string }[] {
  if (typeof value !== "string") {
    return [];
  }
  return [...value.matchAll(REF)].map((m) => ({
    nodeId: m[1] ?? "",
    field: m[2] ?? "",
  }));
}

function actionOf(node: Node): string {
  return node.type === "trigger"
    ? `trigger:${String(node.data.config.triggerType)}`
    : String(node.data.config.actionType);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one checklist per case, kept in one place so it reads like the rubric
function score(
  c: Case,
  built: { nodes: Node[]; edges: Edge[]; notes: string[] },
  issues: string[],
  outputs: Record<string, readonly string[]>
) {
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const add = (name: string, ok: boolean, detail?: string) =>
    checks.push({ name, ok, ...(detail && !ok ? { detail } : {}) });
  const nodes = built.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const trigger = nodes.find((n) => n.type === "trigger");
  const actions = nodes.filter((n) => n.type === "action");
  const ofType = (a: string) => actions.filter((n) => actionOf(n) === a);
  const parents = new Map<string, string[]>();
  for (const e of built.edges) {
    parents.set(e.target, [...(parents.get(e.target) ?? []), e.source]);
  }
  const ancestors = (id: string, seen = new Set<string>()): Set<string> => {
    for (const p of parents.get(id) ?? []) {
      if (!seen.has(p)) {
        seen.add(p);
        ancestors(p, seen);
      }
    }
    return seen;
  };

  const triggerType = String(trigger?.data.config.triggerType ?? "");
  add("trigger", triggerType === c.trigger, `got ${triggerType}`);
  for (const a of c.require ?? []) {
    add(`has ${a}`, ofType(a).length > 0, "missing");
  }
  for (const group of c.requireAny ?? []) {
    add(
      `has one of ${group.join("|")}`,
      group.some((a) => ofType(a).length > 0),
      "missing"
    );
  }
  for (const a of c.forbid ?? []) {
    add(`no ${a}`, ofType(a).length === 0, "present");
  }
  for (const [a, n] of Object.entries(c.minCount ?? {})) {
    add(`${n}+ ${a}`, ofType(a).length >= n, `got ${ofType(a).length}`);
  }
  for (const [a, b] of c.order ?? []) {
    const ok = ofType(b).some((nb) => {
      const anc = ancestors(nb.id);
      return ofType(a).some((na) => anc.has(na.id));
    });
    add(`${a} before ${b}`, ok, "not upstream");
  }
  add("graph valid", issues.length === 0, issues.join("; "));
  const dropped = built.notes.filter((n) =>
    n.startsWith("Removed a reference")
  );
  add("no broken references", dropped.length === 0, dropped.join("; "));

  // Every reference points at a real field.
  let formFields: { key: string; type: string }[] = [];
  try {
    formFields = JSON.parse(String(trigger?.data.config.formFields ?? "[]"));
  } catch {
    formFields = [];
  }
  const formKeys = new Set(formFields.map((f) => f.key));
  const badRefs: string[] = [];
  for (const n of actions) {
    for (const value of Object.values(n.data.config)) {
      for (const r of refsIn(value)) {
        const target = byId.get(r.nodeId);
        if (!target) {
          badRefs.push(`${r.nodeId}.${r.field}`);
          continue;
        }
        const top = r.field.split(".")[0] ?? "";
        if (target.type === "trigger") {
          if (
            triggerType === "Form" &&
            !(formKeys.has(top) || TRIGGER_OUTPUTS.has(top))
          ) {
            badRefs.push(`trigger.${r.field}`);
          }
          continue;
        }
        const action = actionOf(target);
        if (action === "ai/extract") {
          const fields = String(target.data.config.aiFields ?? "")
            .split(LIST_SPLIT)
            .map((s) => s.trim());
          if (!fields.includes(top)) {
            badRefs.push(`${action}.${r.field}`);
          }
        } else if (
          action !== "HTTP Request" &&
          outputs[action] &&
          !outputs[action].includes(top)
        ) {
          badRefs.push(`${action}.${r.field}`);
        }
      }
    }
  }
  add(
    "references point at real fields",
    badRefs.length === 0,
    badRefs.join(", ")
  );

  // Required config is filled in.
  const empty: string[] = [];
  const need: Record<string, string[]> = {
    "telegram/send-message": ["telegramText"],
    "google-sheets/append-row": ["rowValues"],
    "smtp-email/send-email": ["emailTo", "emailSubject", "emailBody"],
    "ai/classify": ["aiInput", "aiLabels"],
    "ai/generate": ["aiPrompt"],
    "ai/extract": ["aiInput", "aiFields"],
    Condition: ["condition"],
    "HTTP Request": ["endpoint"],
  };
  for (const n of actions) {
    for (const key of need[actionOf(n)] ?? []) {
      if (!String(n.data.config[key] ?? "").trim()) {
        empty.push(`${n.data.label}.${key}`);
      }
    }
    if (actionOf(n) === "ai/classify") {
      const labels = String(n.data.config.aiLabels ?? "")
        .split(",")
        .filter((s) => s.trim());
      if (labels.length < 2) {
        empty.push(`${n.data.label}.aiLabels(<2)`);
      }
    }
  }
  add("required settings filled", empty.length === 0, empty.join(", "));

  if (c.cron) {
    const cron = String(trigger?.data.config.scheduleCron ?? "");
    add(`cron ${c.cron}`, cron.trim() === c.cron, `got "${cron}"`);
  }
  if (c.emailToForm) {
    const emailKeys = new Set(
      formFields
        .filter((f) => f.type === "email" || EMAIL_KEY.test(f.key))
        .map((f) => f.key)
    );
    const ok = ofType("smtp-email/send-email").every((n) =>
      refsIn(n.data.config.emailTo).some(
        (r) => byId.get(r.nodeId)?.type === "trigger" && emailKeys.has(r.field)
      )
    );
    add(
      "email goes to the form's email field",
      ok && ofType("smtp-email/send-email").length > 0,
      ofType("smtp-email/send-email")
        .map((n) => String(n.data.config.emailTo))
        .join(" | ")
    );
  }
  if (c.emailUsesDraft) {
    const ok = ofType("smtp-email/send-email").some((n) =>
      [n.data.config.emailSubject, n.data.config.emailBody].some((v) =>
        refsIn(v).some(
          (r) => actionOf(byId.get(r.nodeId) as Node) === "ai/draft-email"
        )
      )
    );
    add("email uses the AI draft", ok);
  }
  if (c.conditionOnClassify) {
    const conds = ofType("Condition");
    const ok = conds.some((n) => {
      const expr = String(n.data.config.condition ?? "");
      return refsIn(expr).some((r) => {
        const target = byId.get(r.nodeId);
        if (
          !(target && actionOf(target) === "ai/classify" && r.field === "label")
        ) {
          return false;
        }
        const labels = String(target.data.config.aiLabels ?? "")
          .split(",")
          .map((s) => s.trim().toLowerCase());
        const quoted = [...expr.matchAll(QUOTED)].map((m) =>
          (m[1] ?? m[2] ?? "").toLowerCase()
        );
        return quoted.some((q) => labels.includes(q));
      });
    });
    add(
      "condition tests one of the classifier's labels",
      ok,
      conds.map((n) => String(n.data.config.condition)).join(" | ")
    );
  }
  if (c.sheetUsesStep) {
    const ok = ofType("google-sheets/append-row").some((n) =>
      refsIn(n.data.config.rowValues).some(
        (r) => actionOf(byId.get(r.nodeId) as Node) === c.sheetUsesStep
      )
    );
    add(`sheet row uses ${c.sheetUsesStep}`, ok);
  }
  if (c.httpEndpoint) {
    const ok = ofType("HTTP Request").some(
      (n) => String(n.data.config.endpoint ?? "").trim() === c.httpEndpoint
    );
    add("HTTP endpoint as asked", ok);
  }
  return checks;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the runner loop plus its report
async function main() {
  const { planWorkflow, summarizeCanvas } = await import("../lib/ai/copilot");
  const { buildWorkflow, COPILOT_ACTIONS } = await import("../lib/ai/plan");
  const { TEMPLATES } = await import("../lib/ai/templates");
  const { normalizeDefinition, toEngineGraph, referencesOf } = await import(
    "../lib/hive/definition"
  );
  const { validateGraph } = await import("@flowledger/engine");

  const golden = JSON.parse(
    readFileSync(resolve(ROOT, "eval", "copilot-golden.json"), "utf8")
  ) as { cases: Case[] };
  const onlyArg = process.argv.indexOf("--only");
  const only =
    onlyArg > 0 ? new Set((process.argv[onlyArg + 1] ?? "").split(",")) : null;
  const cases = golden.cases.filter((c) => !only || only.has(c.id));
  const outputs = Object.fromEntries(
    Object.entries(COPILOT_ACTIONS).map(([k, v]) => [k, v.outputs])
  ) as Record<string, readonly string[]>;
  const connections = {
    "google-sheets": "conn_sheets",
    "smtp-email": "conn_mail",
    telegram: "conn_tg",
  };

  const results: Record<string, unknown>[] = [];
  for (const c of cases) {
    let existing: { name?: string; summary?: string } | undefined;
    if (c.existing) {
      const template = TEMPLATES.find((t) => t.slug === c.existing);
      if (template) {
        const base = buildWorkflow(template.plan, connections);
        existing = { name: base.name, summary: summarizeCanvas(base.nodes) };
      }
    }
    const t0 = Date.now();
    const result = await planWorkflow(c.prompt, existing);
    const ms = Date.now() - t0;
    const built = buildWorkflow(result.plan, connections);
    const definition = normalizeDefinition(built.nodes, built.edges);
    const issues = validateGraph(
      toEngineGraph(definition),
      referencesOf(definition)
    ).map((i) => i.message);
    const checks = [
      {
        name: "real AI (not a template fallback)",
        ok: result.source === "ai",
        ...(result.source === "ai" ? {} : { detail: result.reason }),
      },
      ...score(c, built as never, issues, outputs),
    ];
    const passed = checks.every((k) => k.ok);
    const steps = built.nodes.map((n) => actionOf(n as Node)).join(" > ");
    results.push({
      id: c.id,
      passed,
      ms,
      model: result.model ?? null,
      steps,
      checks,
    });
    const failed = checks.filter((k) => !k.ok);
    console.log(
      `${passed ? "PASS" : "FAIL"}  ${c.id.padEnd(26)} ${(ms / 1000).toFixed(1).padStart(5)}s  ${checks.length - failed.length}/${checks.length}  ${steps}`
    );
    for (const f of failed) {
      console.log(`        - ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  const passedCount = results.filter((r) => r.passed).length;
  const checkTotals = results.flatMap((r) => r.checks as { ok: boolean }[]);
  const latencies = results.map((r) => r.ms as number).sort((a, b) => a - b);
  const pct = (p: number) =>
    latencies[
      Math.min(latencies.length - 1, Math.floor(p * latencies.length))
    ] ?? 0;
  const summary = {
    at: new Date().toISOString(),
    models: {
      smart: process.env.AI_MODEL_SMART,
      fast: process.env.AI_MODEL_FAST,
      fallback: process.env.AI_FALLBACK_PROVIDER
        ? process.env.AI_FALLBACK_MODEL
        : null,
    },
    cases: results.length,
    passed: passedCount,
    checksPassed: checkTotals.filter((k) => k.ok).length,
    checks: checkTotals.length,
    p50ms: pct(0.5),
    p95ms: pct(0.95),
  };
  console.log(
    `\nCopilot golden set: ${passedCount}/${results.length} workflows fully correct; ${summary.checksPassed}/${summary.checks} checks; p50 ${(summary.p50ms / 1000).toFixed(1)}s, p95 ${(summary.p95ms / 1000).toFixed(1)}s`
  );
  const dir = resolve(ROOT, "eval", "results");
  mkdirSync(dir, { recursive: true });
  if (!only) {
    writeFileSync(
      resolve(dir, "copilot-latest.json"),
      `${JSON.stringify({ summary, results }, null, 2)}\n`
    );
    const md = [
      `# Copilot golden set — ${summary.at}`,
      "",
      `Models: smart \`${summary.models.smart}\`, fast \`${summary.models.fast}\`. **${passedCount}/${results.length}** workflows fully correct, ${summary.checksPassed}/${summary.checks} checks, p50 ${(summary.p50ms / 1000).toFixed(1)} s, p95 ${(summary.p95ms / 1000).toFixed(1)} s.`,
      "",
      "| Case | Result | Time | Steps | Failed checks |",
      "|---|---|---|---|---|",
      ...results.map((r) => {
        const failed = (
          r.checks as { ok: boolean; name: string; detail?: string }[]
        ).filter((k) => !k.ok);
        return `| ${r.id} | ${r.passed ? "pass" : "FAIL"} | ${((r.ms as number) / 1000).toFixed(1)} s | ${String(r.steps).replace(/\|/g, "/")} | ${failed.map((f) => `${f.name}${f.detail ? ` (${f.detail.replace(/\|/g, "/").slice(0, 80)})` : ""}`).join("; ")} |`;
      }),
      "",
    ].join("\n");
    writeFileSync(resolve(dir, "copilot-latest.md"), md);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("[eval] crashed:", error);
  process.exit(1);
});
