import { describe, expect, it } from "vitest";
import {
  baseCatalog,
  buildWorkflow,
  COPILOT_ACTIONS,
  type CopilotPlan,
} from "@/lib/ai/plan";
import { repairPlan } from "@/lib/ai/repair";

const form = (
  steps: CopilotPlan["steps"],
  fields = [
    { key: "name", label: "Name", type: "text" as const, required: true },
    { key: "email", label: "Email", type: "email" as const, required: true },
  ]
): CopilotPlan => ({
  name: "Test flow",
  description: "x",
  trigger: { type: "Form", formTitle: "T", formFields: fields },
  steps,
});

const cfg = (plan: CopilotPlan, id: string, key: string) =>
  plan.steps.find((s) => s.id === id)?.config.find((c) => c.key === key)?.value;

describe("Plan repair", () => {
  it("fixes loose operators, word operators and label case", () => {
    const notes: string[] = [];
    const plan = repairPlan(
      form([
        {
          id: "score",
          action: "ai/classify",
          label: "Score",
          config: [
            { key: "aiInput", value: "{{trigger.name}}" },
            { key: "aiLabels", value: "Hot, Warm, Cold" },
          ],
        },
        {
          id: "only_hot",
          action: "Condition",
          label: "Only hot",
          config: [
            {
              key: "condition",
              value: "{{score.label}} == 'hot' or {{score.label}} != \"warm\"",
            },
          ],
        },
      ]),
      COPILOT_ACTIONS,
      notes
    );
    expect(cfg(plan, "only_hot", "condition")).toBe(
      "{{score.label}} === 'Hot' || {{score.label}} !== \"Warm\""
    );
    expect(notes).toEqual([]);
  });

  it("names a label that the classifier can never return", () => {
    const notes: string[] = [];
    repairPlan(
      form([
        {
          id: "score",
          action: "ai/classify",
          label: "Score",
          config: [{ key: "aiLabels", value: "Hot, Cold" }],
        },
        {
          id: "c",
          action: "Condition",
          label: "Check",
          config: [{ key: "condition", value: "{{score.label}} === 'Urgent'" }],
        },
      ]),
      COPILOT_ACTIONS,
      notes
    );
    expect(notes.join(" ")).toContain("not one of score's labels");
  });

  it("maps output names a model guesses to the real ones", () => {
    const plan = repairPlan(
      form([
        {
          id: "track",
          action: "ai/classify",
          label: "Track",
          config: [{ key: "aiLabels", value: "Web, AI" }],
        },
        {
          id: "draft",
          action: "ai/draft-email",
          label: "Draft",
          config: [],
        },
        {
          id: "mail",
          action: "smtp-email/send-email",
          label: "Mail",
          config: [
            { key: "emailTo", value: "{{trigger.email}}" },
            { key: "emailSubject", value: "{{draft.title}}" },
            {
              key: "emailBody",
              value: "{{draft.content}} ({{track.category}})",
            },
          ],
        },
      ]),
      COPILOT_ACTIONS,
      []
    );
    expect(cfg(plan, "mail", "emailSubject")).toBe("{{draft.subject}}");
    expect(cfg(plan, "mail", "emailBody")).toBe(
      "{{draft.body}} ({{track.label}})"
    );
  });

  it("sends to the form's email when the recipient is not an address", () => {
    const notes: string[] = [];
    const plan = repairPlan(
      form([
        {
          id: "mail",
          action: "smtp-email/send-email",
          label: "Mail",
          config: [
            { key: "emailTo", value: "the participant" },
            { key: "emailSubject", value: "Hi" },
            { key: "emailBody", value: "Hello" },
          ],
        },
      ]),
      COPILOT_ACTIONS,
      notes
    );
    expect(cfg(plan, "mail", "emailTo")).toBe("{{trigger.email}}");
    expect(notes.join(" ")).toContain("form's email address");
  });

  it("fills empty Sheet rows, Telegram text and AI-drafted email parts", () => {
    const plan = repairPlan(
      form([
        { id: "draft", action: "ai/draft-email", label: "Draft", config: [] },
        {
          id: "row",
          action: "google-sheets/append-row",
          label: "Row",
          config: [],
        },
        {
          id: "tg",
          action: "telegram/send-message",
          label: "Alert",
          config: [],
        },
        {
          id: "mail",
          action: "smtp-email/send-email",
          label: "Mail",
          config: [{ key: "emailTo", value: "{{trigger.email}}" }],
        },
      ]),
      COPILOT_ACTIONS,
      []
    );
    expect(cfg(plan, "row", "rowValues")).toBe(
      "{{trigger.submittedAt}}\\n{{trigger.name}}\\n{{trigger.email}}"
    );
    expect(cfg(plan, "tg", "telegramText")).toContain("{{trigger.name}}");
    expect(cfg(plan, "mail", "emailSubject")).toBe("{{draft.subject}}");
    expect(cfg(plan, "mail", "emailBody")).toBe("{{draft.body}}");
  });

  it("turns delay words into numbers", () => {
    const plan = repairPlan(
      form([
        {
          id: "wait",
          action: "Delay",
          label: "Wait",
          config: [{ key: "delayMinutes", value: "2 hours" }],
        },
        { id: "w2", action: "Delay", label: "Wait 2", config: [] },
      ]),
      COPILOT_ACTIONS,
      []
    );
    expect(cfg(plan, "wait", "delayMinutes")).toBe("120");
    expect(cfg(plan, "w2", "delayMinutes")).toBe("1");
  });

  it("never edits the plan it was given (templates are shared)", () => {
    const original = form([
      {
        id: "row",
        action: "google-sheets/append-row",
        label: "Row",
        config: [],
      },
    ]);
    repairPlan(original, COPILOT_ACTIONS, []);
    expect(original.steps[0]?.config).toEqual([]);
  });
});

describe("HTTP Request only with a real URL", () => {
  it("is offered only when the request has a URL", () => {
    expect("HTTP Request" in baseCatalog("only the first 5 submissions")).toBe(
      false
    );
    expect(
      "HTTP Request" in baseCatalog("send the lead to https://crm.acme.in/api")
    ).toBe(true);
  });

  it("keeps a URL the user gave, even one that looks like an example", () => {
    const plan: CopilotPlan = {
      name: "CRM",
      description: "x",
      trigger: { type: "Manual" },
      steps: [
        {
          id: "crm",
          action: "HTTP Request",
          label: "Send to CRM",
          config: [{ key: "endpoint", value: "https://crm.example.com/api" }],
        },
      ],
    };
    const built = buildWorkflow(
      plan,
      {},
      {},
      "post to https://crm.example.com/api"
    );
    expect(
      built.nodes.find((n) => n.type === "action")?.data.config.endpoint
    ).toBe("https://crm.example.com/api");
  });
});
