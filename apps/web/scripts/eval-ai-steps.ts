/**
 * AI step accuracy eval: the classify / extract / draft-email / generate steps
 * on labelled examples, with the real models from .env.local.
 *
 *   pnpm --filter @flowledger/web eval:ai
 *
 * Writes eval/results/ai-steps-latest.{json,md}.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const ROOT = resolve(process.cwd(), "..", "..");
const PLACEHOLDER = /\[(name|your name|date)\]/i;
const TRACKS = "AI/ML, Web3, HealthTech, EdTech, FinTech, Other";

const CLASSIFY = [
  {
    text: "A chatbot that uses a fine-tuned LLM to answer farmers' crop questions in Telugu",
    labels: TRACKS,
    expect: "AI/ML",
  },
  {
    text: "Verifying degree certificates on a blockchain so employers can check them instantly",
    labels: TRACKS,
    expect: "Web3",
  },
  {
    text: "An app that reminds diabetic patients to take insulin and alerts their doctor",
    labels: TRACKS,
    expect: "HealthTech",
  },
  {
    text: "Gamified quizzes that help Class 10 students revise maths before board exams",
    labels: TRACKS,
    expect: "EdTech",
  },
  {
    text: "UPI expense splitting for hostel roommates with automatic monthly settlements",
    labels: TRACKS,
    expect: "FinTech",
  },
  {
    text: "A smart dustbin that alerts the municipality when it is full",
    labels: TRACKS,
    expect: "Other",
  },
  {
    text: "We have budget approved and need 50 seats of your product by next week. Please call me today.",
    labels: "Hot, Warm, Cold",
    expect: "Hot",
  },
  {
    text: "Just browsing, maybe next year. Send me a brochure.",
    labels: "Hot, Warm, Cold",
    expect: "Cold",
  },
  {
    text: "Interested, comparing a few tools this quarter, can you share pricing?",
    labels: "Hot, Warm, Cold",
    expect: "Warm",
  },
  {
    text: "The delivery was late and the food was cold. Very disappointed.",
    labels: "Positive, Neutral, Negative",
    expect: "Negative",
  },
  {
    text: "Loved the workshop! The speakers were brilliant and very helpful.",
    labels: "Positive, Neutral, Negative",
    expect: "Positive",
  },
  {
    text: "Our payment gateway is down for all customers, nobody can check out!",
    labels: "High, Medium, Low",
    expect: "High",
  },
];

const EXTRACT = [
  {
    text: "Hi, I'm looking for a 2BHK flat in Hanamkonda, budget around 25 lakhs, need it by March.",
    fields: "location, budget, deadline",
    expect: { location: "hanamkonda", budget: "25", deadline: "march" },
  },
  {
    text: "Please send 200 printed T-shirts (size M) to NIT Warangal before 15 Nov. Contact Ravi on 9876543210.",
    fields: "product, quantity, phone",
    expect: { product: "t-shirt", quantity: "200", phone: "9876543210" },
  },
  {
    text: "Need a laptop for video editing, my budget is ₹80,000.",
    fields: "product, budget",
    expect: { product: "laptop", budget: "80" },
  },
];

function norm(s: unknown) {
  return String(s ?? "").toLowerCase();
}

async function timed<T>(fn: () => Promise<T>) {
  const t0 = Date.now();
  try {
    return { ok: true as const, value: await fn(), ms: Date.now() - t0 };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
      ms: Date.now() - t0,
    };
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a linear list of eval cases
async function main() {
  const { classify, extractFields, draftEmail, generate } = await import(
    "../lib/ai/actions"
  );
  const rows: {
    kind: string;
    case: string;
    ok: boolean;
    ms: number;
    got: string;
  }[] = [];
  const log = (r: (typeof rows)[number]) => {
    rows.push(r);
    console.log(
      `${r.ok ? "PASS" : "FAIL"}  ${r.kind.padEnd(9)} ${(r.ms / 1000).toFixed(1).padStart(4)}s  ${r.case.slice(0, 60).padEnd(60)}  ${r.got.slice(0, 70)}`
    );
  };

  for (const c of CLASSIFY) {
    const r = await timed(() => classify({ text: c.text, labels: c.labels }));
    log({
      kind: "classify",
      case: c.text,
      ms: r.ms,
      ok: r.ok && norm(r.value.label) === norm(c.expect),
      got: r.ok
        ? `${r.value.label} (${r.value.confidence}) want ${c.expect}`
        : r.error,
    });
  }
  for (const c of EXTRACT) {
    const r = await timed(() =>
      extractFields({ text: c.text, fields: c.fields })
    );
    const okFields = r.ok
      ? Object.entries(c.expect).every(([k, v]) =>
          norm(r.value[k]).replace(/,/g, "").includes(v)
        )
      : false;
    log({
      kind: "extract",
      case: c.text,
      ms: r.ms,
      ok: okFields,
      got: r.ok
        ? JSON.stringify(
            Object.fromEntries(
              Object.keys(c.expect).map((k) => [k, r.value[k]])
            )
          )
        : r.error,
    });
  }
  const drafts = [
    {
      recipientName: "Asha",
      context:
        "Registered for TRI-CITY AI Hackathon; track AI/ML; idea: crop advice chatbot in Telugu",
      goal: "Welcome her and confirm her track",
      senderName: "Hackathon Team",
    },
    {
      recipientName: "Dr. Rao's patient Kiran",
      context:
        "Appointment booked for 12 Oct at 10:30 AM at Sai Clinic, Kazipet",
      goal: "Confirm the appointment and ask them to arrive 10 minutes early",
      senderName: "Sai Clinic",
    },
  ];
  for (const d of drafts) {
    const r = await timed(() => draftEmail(d));
    const body = r.ok ? `${r.value.subject}\n${r.value.body}` : "";
    const firstName = d.recipientName.split(" ").at(-1) ?? "";
    const ok =
      r.ok &&
      r.value.subject.trim().length > 3 &&
      r.value.body.length > 40 &&
      body.includes(firstName) &&
      !PLACEHOLDER.test(body) &&
      body.length < 2000;
    log({
      kind: "draft",
      case: d.goal,
      ms: r.ms,
      ok,
      got: r.ok
        ? `"${r.value.subject}" (${r.value.body.length} chars)`
        : r.error,
    });
  }
  const gens = [
    {
      prompt:
        "Write a 2-sentence motivational message for a college coding club's Telegram group for Monday morning.",
      max: 600,
    },
    {
      prompt:
        "Summarise in one line: Our webinar on UPI fraud prevention had 120 attendees, 4.6/5 rating, and 30 asked for a follow-up session.",
      max: 300,
      mustInclude: ["120"],
    },
  ];
  for (const g of gens) {
    const r = await timed(() => generate({ prompt: g.prompt }));
    const ok =
      r.ok &&
      r.value.text.trim().length > 10 &&
      r.value.text.length <= g.max &&
      (g.mustInclude ?? []).every((m) => r.value.text.includes(m));
    log({
      kind: "generate",
      case: g.prompt,
      ms: r.ms,
      ok,
      got: r.ok ? r.value.text.replace(/\s+/g, " ") : r.error,
    });
  }

  const byKind: Record<string, { pass: number; total: number }> = {};
  for (const r of rows) {
    byKind[r.kind] ??= { pass: 0, total: 0 };
    byKind[r.kind].total += 1;
    byKind[r.kind].pass += r.ok ? 1 : 0;
  }
  const latencies = rows.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length / 2)] ?? 0;
  const line = Object.entries(byKind)
    .map(([k, v]) => `${k} ${v.pass}/${v.total}`)
    .join(", ");
  console.log(
    `\nAI steps: ${rows.filter((r) => r.ok).length}/${rows.length} (${line}); p50 ${(p50 / 1000).toFixed(1)}s`
  );
  const dir = resolve(ROOT, "eval", "results");
  mkdirSync(dir, { recursive: true });
  const at = new Date().toISOString();
  writeFileSync(
    resolve(dir, "ai-steps-latest.json"),
    `${JSON.stringify({ at, models: { fast: process.env.AI_MODEL_FAST, smart: process.env.AI_MODEL_SMART }, byKind, rows }, null, 2)}\n`
  );
  writeFileSync(
    resolve(dir, "ai-steps-latest.md"),
    [
      `# AI steps — ${at}`,
      "",
      `Model (fast tier): \`${process.env.AI_MODEL_FAST}\`. **${rows.filter((r) => r.ok).length}/${rows.length}** correct (${line}), p50 ${(p50 / 1000).toFixed(1)} s.`,
      "",
      "| Step | Result | Time | Input | Output |",
      "|---|---|---|---|---|",
      ...rows.map(
        (r) =>
          `| ${r.kind} | ${r.ok ? "pass" : "FAIL"} | ${(r.ms / 1000).toFixed(1)} s | ${r.case.replace(/\|/g, "/").slice(0, 70)} | ${r.got.replace(/\|/g, "/").slice(0, 90)} |`
      ),
      "",
    ].join("\n")
  );
  process.exit(0);
}

main().catch((error) => {
  console.error("[eval] crashed:", error);
  process.exit(1);
});
