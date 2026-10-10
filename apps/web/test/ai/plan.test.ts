import { validateGraph } from "@flowledger/engine";
import { describe, expect, it } from "vitest";
import { buildWorkflow, type CopilotPlan } from "@/lib/ai/plan";
import { closestTemplate, TEMPLATES } from "@/lib/ai/templates";
import {
  normalizeDefinition,
  referencesOf,
  toEngineGraph,
} from "@/lib/hive/definition";

const NOT_EARLIER = /not an earlier step/;

function issuesOf(plan: CopilotPlan, connections: Record<string, string> = {}) {
  const built = buildWorkflow(plan, connections);
  const definition = normalizeDefinition(built.nodes, built.edges);
  return {
    built,
    issues: validateGraph(toEngineGraph(definition), referencesOf(definition)),
  };
}

describe("Copilot plan → workflow", () => {
  it.each(
    TEMPLATES.map((t) => [t.slug, t.plan] as const)
  )("template %s builds a valid graph", (_slug, plan) => {
    const { built, issues } = issuesOf(plan, {
      "google-sheets": "int_s",
      "smtp-email": "int_e",
      telegram: "int_t",
    });
    expect(issues).toEqual([]);
    expect(built.nodes.filter((n) => n.type === "trigger")).toHaveLength(1);
    expect(built.notes).toEqual([]);
  });

  it("rewrites references to the builder syntax and attaches connections", () => {
    const hero = closestTemplate("registrations for our college fest").plan;
    const { built } = issuesOf(hero, { "smtp-email": "int_e" });
    const email = built.nodes.find(
      (n) => n.data.config.actionType === "smtp-email/send-email"
    );
    const trigger = built.nodes.find((n) => n.type === "trigger");
    expect(email?.data.config.integrationId).toBe("int_e");
    expect(email?.data.config.emailTo).toBe(`{{@${trigger?.id}:Form.email}}`);
    expect(String(email?.data.config.emailBody)).toContain(
      "\n\nProof of your registration"
    );
    expect(built.notes.some((n) => n.includes("Connect"))).toBe(true);
  });

  it("fans out parallel steps and lays them out in one column", () => {
    const { built } = issuesOf(TEMPLATES[0]?.plan as CopilotPlan);
    const draft = built.nodes.find(
      (n) => n.data.config.actionType === "ai/draft-email"
    );
    const fanOut = built.edges.filter((e) => e.source === draft?.id);
    expect(fanOut).toHaveLength(3);
    const xs = new Set(
      fanOut.map((e) => built.nodes.find((n) => n.id === e.target)?.position.x)
    );
    expect(xs.size).toBe(1);
  });

  it("repairs bad model output instead of failing", () => {
    const plan: CopilotPlan = {
      name: "Messy",
      description: "",
      trigger: { type: "Webhook" },
      steps: [
        {
          id: "Send Mail!",
          action: "smtp-email/send-email",
          label: "Mail",
          after: ["later"],
          config: [
            { key: "emailTo", value: "{{later.email}}" },
            { key: "notARealKey", value: "x" },
          ],
        },
        {
          id: "later",
          action: "ai/generate",
          label: "Later",
          config: [{ key: "aiPrompt", value: "{{trigger.text}}" }],
        },
      ],
    };
    const { built, issues } = issuesOf(plan);
    expect(issues).toEqual([]);
    const mail = built.nodes.find((n) => n.data.label === "Mail");
    expect(mail?.data.config.emailTo).toBe("");
    expect(mail?.data.config).not.toHaveProperty("notARealKey");
    expect(built.notes.join(" ")).toMatch(NOT_EARLIER);
  });

  it("picks the closest template by keywords", () => {
    expect(
      closestTemplate("When a patient books an appointment at my clinic").slug
    ).toBe("clinic-appointment");
    expect(closestTemplate("score new sales leads").slug).toBe("lead-scoring");
    expect(closestTemplate("something unrelated").slug).toBe(
      "hackathon-registration"
    );
  });
});

describe("Copilot: form fields match what the steps use", () => {
  const plan = (
    fields?: CopilotPlan["trigger"]["formFields"]
  ): CopilotPlan => ({
    name: "Leads",
    description: "x",
    trigger: { type: "Form", formFields: fields },
    steps: [
      {
        id: "score",
        action: "ai/classify",
        label: "Score",
        config: [
          {
            key: "aiInput",
            value: "{{trigger.fullName}} wants {{trigger.projectDetails}}",
          },
          { key: "aiLabels", value: "Hot, Warm, Cold" },
        ],
      },
      {
        id: "mail",
        action: "smtp-email/send-email",
        label: "Mail",
        config: [
          { key: "emailTo", value: "{{trigger.workEmail}}" },
          { key: "emailSubject", value: "Hi {{trigger.fullName}}" },
          { key: "emailBody", value: "Sent {{trigger.submittedAt}}" },
        ],
      },
    ],
  });
  const fieldsOf = (p: CopilotPlan) => {
    const trigger = buildWorkflow(p).nodes.find((n) => n.type === "trigger");
    return JSON.parse(String(trigger?.data.config.formFields)) as {
      key: string;
      type: string;
    }[];
  };

  it("adds referenced keys the plan forgot, with sensible types", () => {
    const fields = fieldsOf(
      plan([{ key: "name", label: "Name", type: "text", required: true }])
    );
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f.type]));
    expect(byKey).toMatchObject({
      name: "text",
      fullName: "text",
      projectDetails: "textarea",
      workEmail: "email",
    });
    expect(byKey.submittedAt).toBeUndefined();
  });

  it("starts from the default fields when the plan gives none", () => {
    const keys = fieldsOf(plan(undefined)).map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining(["email", "fullName", "workEmail"])
    );
  });

  it("never duplicates a field the plan already has", () => {
    const fields = fieldsOf(
      plan([
        { key: "fullName", label: "Full name", type: "text", required: true },
        { key: "workEmail", label: "Email", type: "email", required: true },
        {
          key: "projectDetails",
          label: "Details",
          type: "textarea",
          required: false,
        },
      ])
    );
    expect(fields.map((f) => f.key).sort()).toEqual([
      "fullName",
      "projectDetails",
      "workEmail",
    ]);
  });
});
