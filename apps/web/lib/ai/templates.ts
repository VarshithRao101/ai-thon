import type { CopilotPlan } from "./plan";

/**
 * Ready-made plans (docs/02 "Sample workflows"). They seed the template
 * gallery and are the Copilot's offline fallback when no AI model answers.
 */
export type TemplatePlan = {
  slug: string;
  title: string;
  summary: string;
  keywords: string[];
  plan: CopilotPlan;
};

const kv = (config: Record<string, string>) =>
  Object.entries(config).map(([key, value]) => ({ key, value }));

export const TEMPLATES: TemplatePlan[] = [
  {
    slug: "hackathon-registration",
    title: "Hackathon registration",
    summary:
      "Form → AI picks the track → personal email + Sheet row + Telegram alert, each with a proof link",
    keywords: [
      "regist",
      "hackathon",
      "event",
      "fest",
      "participant",
      "signup",
      "sign up",
      "form",
    ],
    plan: {
      name: "Hackathon registration",
      description:
        "Register participants, sort them into tracks with AI, confirm by email and alert the team.",
      trigger: {
        type: "Form",
        formTitle: "TRI-CITY AI Hackathon registration",
        formFields: [
          { key: "name", label: "Full name", type: "text", required: true },
          { key: "email", label: "Email", type: "email", required: true },
          { key: "college", label: "College", type: "text", required: true },
          {
            key: "idea",
            label: "What do you want to build?",
            type: "textarea",
            required: true,
          },
        ],
      },
      steps: [
        {
          id: "classify",
          action: "ai/classify",
          label: "Pick a track",
          config: kv({
            aiInput: "{{trigger.idea}}",
            aiLabels: "AI/ML, Web, Blockchain, IoT, Open Innovation",
          }),
        },
        {
          id: "draft",
          action: "ai/draft-email",
          label: "Draft confirmation",
          config: kv({
            aiRecipientName: "{{trigger.name}}",
            aiContext:
              "College: {{trigger.college}}. Idea: {{trigger.idea}}. Track: {{classify.label}}",
            aiGoal:
              "Confirm their hackathon registration and tell them their track",
            aiTone: "warm and professional",
            aiSenderName: "Team Hydra",
          }),
        },
        {
          id: "sheet",
          action: "google-sheets/append-row",
          label: "Save to Sheet",
          after: ["draft"],
          config: kv({
            rowValues:
              "{{trigger.submittedAt}}\\n{{trigger.name}}\\n{{trigger.email}}\\n{{trigger.college}}\\n{{trigger.idea}}\\n{{classify.label}}\\n{{trigger.runId}}",
          }),
        },
        {
          id: "email",
          action: "smtp-email/send-email",
          label: "Email participant",
          after: ["draft"],
          config: kv({
            emailTo: "{{trigger.email}}",
            emailSubject: "{{draft.subject}}",
            emailBody:
              "{{draft.body}}\\n\\nProof of your registration: {{trigger.verifyUrl}}",
          }),
        },
        {
          id: "alert",
          action: "telegram/send-message",
          label: "Alert the team",
          after: ["draft"],
          config: kv({
            telegramText:
              "🐝 New registration: {{trigger.name}} ({{trigger.college}})\nTrack: {{classify.label}}",
          }),
        },
      ],
    },
  },
  {
    slug: "lead-scoring",
    title: "Lead capture + AI scoring",
    summary:
      "Form → AI scores the lead → hot leads ping Telegram; every lead lands in the Sheet",
    keywords: [
      "lead",
      "sales",
      "customer",
      "enquiry",
      "inquiry",
      "score",
      "crm",
    ],
    plan: {
      name: "Lead capture + AI scoring",
      description:
        "Score every new lead with AI, log it, and alert sales instantly about hot ones.",
      trigger: {
        type: "Form",
        formTitle: "Talk to us",
        formFields: [
          { key: "name", label: "Your name", type: "text", required: true },
          { key: "email", label: "Work email", type: "email", required: true },
          { key: "company", label: "Company", type: "text", required: false },
          {
            key: "need",
            label: "What do you need?",
            type: "textarea",
            required: true,
          },
        ],
      },
      steps: [
        {
          id: "score",
          action: "ai/classify",
          label: "Score lead",
          config: kv({
            aiInput: "Company: {{trigger.company}}. Need: {{trigger.need}}",
            aiLabels: "Hot, Warm, Cold",
            aiInstructions: "Hot = clear budget or urgent need",
          }),
        },
        {
          id: "sheet",
          action: "google-sheets/append-row",
          label: "Log lead",
          config: kv({
            rowValues:
              "{{trigger.submittedAt}}\\n{{trigger.name}}\\n{{trigger.email}}\\n{{trigger.company}}\\n{{score.label}}",
          }),
        },
        {
          id: "is_hot",
          action: "Condition",
          label: "Is it hot?",
          after: ["score"],
          config: kv({ condition: "{{score.label}} === 'Hot'" }),
        },
        {
          id: "alert",
          action: "telegram/send-message",
          label: "Ping sales",
          config: kv({
            telegramText:
              "🔥 Hot lead: {{trigger.name}} ({{trigger.company}}): {{score.reason}}",
          }),
        },
      ],
    },
  },
  {
    slug: "clinic-appointment",
    title: "Clinic appointment",
    summary: "Form → Sheet → confirmation email → wait → reminder email",
    keywords: [
      "clinic",
      "appointment",
      "doctor",
      "patient",
      "booking",
      "reminder",
      "hospital",
    ],
    plan: {
      name: "Clinic appointment",
      description: "Confirm appointments right away and send a reminder later.",
      trigger: {
        type: "Form",
        formTitle: "Book an appointment",
        formFields: [
          { key: "name", label: "Patient name", type: "text", required: true },
          { key: "email", label: "Email", type: "email", required: true },
          {
            key: "slot",
            label: "Preferred slot",
            type: "select",
            required: true,
            options: "Morning, Afternoon, Evening",
          },
        ],
      },
      steps: [
        {
          id: "sheet",
          action: "google-sheets/append-row",
          label: "Add to schedule",
          config: kv({
            rowValues:
              "{{trigger.submittedAt}}\\n{{trigger.name}}\\n{{trigger.email}}\\n{{trigger.slot}}",
          }),
        },
        {
          id: "confirm",
          action: "smtp-email/send-email",
          label: "Confirm booking",
          config: kv({
            emailTo: "{{trigger.email}}",
            emailSubject: "Your appointment request is received",
            emailBody:
              "Hi {{trigger.name}},\\n\\nWe have your request for a {{trigger.slot}} slot. We'll remind you before it.\\n\\nClinic team",
          }),
        },
        {
          id: "wait",
          action: "Delay",
          label: "Wait",
          config: kv({ delayMinutes: "1" }),
        },
        {
          id: "remind",
          action: "smtp-email/send-email",
          label: "Send reminder",
          config: kv({
            emailTo: "{{trigger.email}}",
            emailSubject: "Reminder: your appointment",
            emailBody:
              "Hi {{trigger.name}}, a reminder about your {{trigger.slot}} appointment.",
          }),
        },
      ],
    },
  },
  {
    slug: "daily-digest",
    title: "Daily team digest",
    summary: "Every morning at 9 (IST) → AI writes the update → Telegram",
    keywords: [
      "daily",
      "every day",
      "morning",
      "digest",
      "schedule",
      "summary",
      "report",
    ],
    plan: {
      name: "Daily team digest",
      description: "A short AI-written morning update for the team.",
      trigger: { type: "Schedule", scheduleCron: "0 9 * * *" },
      steps: [
        {
          id: "write",
          action: "ai/generate",
          label: "Write the update",
          config: kv({
            aiPrompt:
              "Write a 3-line upbeat morning update for a hackathon team with one practical tip.",
            aiTone: "short and direct",
          }),
        },
        {
          id: "post",
          action: "telegram/send-message",
          label: "Post to team",
          config: kv({ telegramText: "☀️ {{write.text}}" }),
        },
      ],
    },
  },
  {
    slug: "payment-webhook",
    title: "Payment webhook",
    summary: "Webhook → Sheet → thank-you email → Telegram",
    keywords: [
      "payment",
      "webhook",
      "razorpay",
      "order",
      "invoice",
      "purchase",
      "api",
    ],
    plan: {
      name: "Payment received",
      description: "Record payments from a webhook and thank the customer.",
      trigger: { type: "Webhook" },
      steps: [
        {
          id: "sheet",
          action: "google-sheets/append-row",
          label: "Record payment",
          config: kv({
            rowValues:
              "{{trigger.timestamp}}\\n{{trigger.email}}\\n{{trigger.amount}}\\n{{trigger.runId}}",
          }),
        },
        {
          id: "thanks",
          action: "smtp-email/send-email",
          label: "Thank the customer",
          config: kv({
            emailTo: "{{trigger.email}}",
            emailSubject: "Payment received. Thank you!",
            emailBody:
              "We received ₹{{trigger.amount}}. Receipt: {{trigger.verifyUrl}}",
          }),
        },
        {
          id: "alert",
          action: "telegram/send-message",
          label: "Alert team",
          config: kv({
            telegramText:
              "💸 Payment ₹{{trigger.amount}} from {{trigger.email}}",
          }),
        },
      ],
    },
  },
];

/** The template whose keywords best match a request (the hero flow by default). */
export function closestTemplate(prompt: string): TemplatePlan {
  const text = prompt.toLowerCase();
  let best = TEMPLATES[0] as TemplatePlan;
  let bestScore = 0;
  for (const template of TEMPLATES) {
    const score = template.keywords.filter((k) => text.includes(k)).length;
    if (score > bestScore) {
      best = template;
      bestScore = score;
    }
  }
  return best;
}
