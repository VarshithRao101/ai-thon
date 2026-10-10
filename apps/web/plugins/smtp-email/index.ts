import type { IntegrationPlugin } from "../registry";
import { registerIntegration } from "../registry";
import { SmtpEmailIcon } from "./icon";

const smtpEmailPlugin: IntegrationPlugin = {
  type: "smtp-email",
  label: "Email (Gmail)",
  description: "Send email to anyone from your Gmail (or any SMTP) account",
  icon: SmtpEmailIcon,
  formFields: [
    {
      id: "user",
      label: "Sender address",
      type: "text",
      placeholder: "you@gmail.com",
      configKey: "user",
      envVar: "SMTP_USER",
    },
    {
      id: "password",
      label: "App password",
      type: "password",
      placeholder: "xxxx xxxx xxxx xxxx",
      configKey: "password",
      envVar: "SMTP_PASSWORD",
      helpText: "Gmail: turn on 2-Step Verification, then create one at ",
      helpLink: {
        text: "myaccount.google.com/apppasswords",
        url: "https://myaccount.google.com/apppasswords",
      },
    },
    {
      id: "fromName",
      label: "Sender name",
      type: "text",
      placeholder: "Team Hydra",
      configKey: "fromName",
      envVar: "SMTP_FROM_NAME",
    },
    {
      id: "host",
      label: "SMTP host (optional)",
      type: "text",
      placeholder: "smtp.gmail.com",
      configKey: "host",
      envVar: "SMTP_HOST",
    },
  ],
  // Connection test: lib/integrations/connection-tests.ts (server-only code).
  actions: [
    {
      slug: "send-email",
      label: "Send Email",
      description: "Send an email (plain text with a clean HTML version)",
      category: "Email",
      stepFunction: "sendSmtpEmailStep",
      stepImportPath: "send-email",
      outputFields: [
        { field: "messageId", description: "Message id" },
        { field: "to", description: "Recipient" },
      ],
      configFields: [
        {
          key: "emailTo",
          label: "To",
          type: "template-input",
          placeholder: "{{Form.email}}",
          example: "{{@trigger:Form.email}}",
          required: true,
        },
        {
          key: "emailSubject",
          label: "Subject",
          type: "template-input",
          placeholder: "{{AI Draft Email.subject}}",
          example: "You're registered!",
          required: true,
        },
        {
          key: "emailBody",
          label: "Body",
          type: "template-textarea",
          placeholder: "{{AI Draft Email.body}}",
          example: "Hi {{@trigger:Form.name}}, thanks for registering.",
          rows: 6,
          required: true,
        },
        {
          key: "emailReplyTo",
          label: "Reply-to (optional)",
          type: "template-input",
          placeholder: "team@example.com",
        },
      ],
    },
  ],
};

registerIntegration(smtpEmailPlugin);
export default smtpEmailPlugin;
