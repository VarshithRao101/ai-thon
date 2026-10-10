import type { IntegrationPlugin } from "../registry";
import { registerIntegration } from "../registry";
import { AiIcon } from "./icon";

const TONES = [
  { value: "warm and professional", label: "Warm & professional" },
  { value: "friendly and casual", label: "Friendly" },
  { value: "formal", label: "Formal" },
  { value: "short and direct", label: "Short & direct" },
];

const aiPlugin: IntegrationPlugin = {
  type: "ai",
  label: "N-Flow AI",
  description:
    "Classify, extract, draft emails and generate text (Gemini, Groq fallback)",
  icon: AiIcon,
  // Platform keys from env: no per-workspace connection needed.
  formFields: [],
  // Connection test: lib/integrations/connection-tests.ts (server-only code).
  actions: [
    {
      slug: "classify",
      label: "AI Classify",
      description:
        "Sort the input into one of your labels, with a confidence and a reason",
      category: "AI",
      stepFunction: "classifyStep",
      stepImportPath: "classify",
      outputFields: [
        { field: "label", description: "Chosen label" },
        { field: "confidence", description: "0 to 1" },
        { field: "reason", description: "One-sentence reason" },
      ],
      configFields: [
        {
          key: "aiInput",
          label: "Text to classify",
          type: "template-textarea",
          placeholder: "{{Form.idea}}",
          example: "{{@trigger:Form.idea}}",
          rows: 3,
          required: true,
        },
        {
          key: "aiLabels",
          label: "Labels (comma-separated)",
          type: "text",
          placeholder: "AI/ML, Web, Blockchain, IoT",
          example: "AI/ML, Web, Blockchain, IoT",
          required: true,
        },
        {
          key: "aiInstructions",
          label: "Guidance (optional)",
          type: "template-input",
          placeholder: "e.g. Prefer AI/ML when unsure",
        },
      ],
    },
    {
      slug: "draft-email",
      label: "AI Draft Email",
      description: "Write a short personal email from context and a goal",
      category: "AI",
      stepFunction: "draftEmailStep",
      stepImportPath: "draft-email",
      outputFields: [
        { field: "subject", description: "Email subject" },
        { field: "body", description: "Email body (plain text)" },
      ],
      configFields: [
        {
          key: "aiRecipientName",
          label: "Recipient name",
          type: "template-input",
          placeholder: "{{Form.name}}",
          example: "{{@trigger:Form.name}}",
        },
        {
          key: "aiContext",
          label: "Context",
          type: "template-textarea",
          placeholder: "Who they are and what they sent",
          example: "College: {{@trigger:Form.college}}. Idea: {{@trigger:Form.idea}}",
          rows: 3,
          required: true,
        },
        {
          key: "aiGoal",
          label: "Goal",
          type: "template-input",
          placeholder: "Confirm their registration and their track",
          example: "Confirm their hackathon registration",
          required: true,
        },
        {
          key: "aiTone",
          label: "Tone",
          type: "select",
          options: TONES,
          defaultValue: "warm and professional",
        },
        {
          key: "aiSenderName",
          label: "Sign off as",
          type: "template-input",
          placeholder: "Team Hydra",
        },
      ],
    },
    {
      slug: "extract",
      label: "AI Extract Fields",
      description: "Pull named fields out of free text as JSON",
      category: "AI",
      stepFunction: "extractStep",
      stepImportPath: "extract",
      configFields: [
        {
          key: "aiInput",
          label: "Text",
          type: "template-textarea",
          placeholder: "{{Webhook.message}}",
          rows: 3,
          required: true,
        },
        {
          key: "aiFields",
          label: "Fields (comma-separated)",
          type: "text",
          placeholder: "name, phone, city",
          example: "name, email, company",
          required: true,
        },
      ],
    },
    {
      slug: "generate",
      label: "AI Generate Text",
      description: "Generate text from a prompt",
      category: "AI",
      stepFunction: "generateStep",
      stepImportPath: "generate",
      outputFields: [{ field: "text", description: "Generated text" }],
      configFields: [
        {
          key: "aiPrompt",
          label: "Prompt",
          type: "template-textarea",
          placeholder: "Summarize {{Form.idea}} in one line",
          rows: 4,
          required: true,
        },
        {
          key: "aiTone",
          label: "Tone",
          type: "select",
          options: TONES,
          defaultValue: "warm and professional",
        },
      ],
    },
  ],
};

registerIntegration(aiPlugin);
export default aiPlugin;
