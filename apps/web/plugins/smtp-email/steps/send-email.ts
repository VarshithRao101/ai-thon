import "server-only";

import type { StepError } from "@flowledger/engine";
import { fetchCredentials } from "@/lib/credential-fetcher";
import { type StepInput, withStepLogging } from "@/lib/steps/step-handler";
import type { SmtpEmailCredentials } from "../credentials";
import { createTransport } from "../transport";

type SendEmailResult =
  | { success: true; data: { messageId: string; to: string } }
  | { success: false; error: StepError };

export type SendSmtpEmailCoreInput = {
  emailTo: string;
  emailSubject: string;
  emailBody: string;
  emailReplyTo?: string;
};

export type SendSmtpEmailInput = StepInput &
  SendSmtpEmailCoreInput & {
    integrationId?: string;
  };

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Plain text plus a simple branded HTML version of the same body. */
function toHtml(body: string): string {
  const paragraphs = escapeHtml(body)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1c1917;max-width:560px">${paragraphs}<p style="margin:24px 0 0;font-size:12px;color:#78716c">Sent with N-Flow</p></div>`;
}

async function stepHandler(
  input: SendSmtpEmailCoreInput & { idempotencyKey?: string },
  credentials: SmtpEmailCredentials
): Promise<SendEmailResult> {
  if (!(credentials.SMTP_USER && credentials.SMTP_PASSWORD)) {
    return {
      success: false,
      error: { message: "Connect an email sender first (Connections → Email)", class: "auth" },
    };
  }
  const to = (input.emailTo || "").trim();
  if (!EMAIL.test(to)) {
    return {
      success: false,
      error: { message: `"${to || "(empty)"}" is not a valid email address`, class: "validation" },
    };
  }
  const fromName = credentials.SMTP_FROM_NAME?.trim() || "N-Flow";
  try {
    const info = await createTransport(credentials).sendMail({
      from: { name: fromName, address: credentials.SMTP_USER.trim() },
      to,
      subject: (input.emailSubject || "(no subject)").slice(0, 200),
      text: input.emailBody || "",
      html: toHtml(input.emailBody || ""),
      ...(input.emailReplyTo && EMAIL.test(input.emailReplyTo.trim())
        ? { replyTo: input.emailReplyTo.trim() }
        : {}),
      // Stable per (run, step): a duplicate delivery is recognisable in the inbox.
      ...(input.idempotencyKey
        ? { messageId: `<${input.idempotencyKey.replace(/[^a-zA-Z0-9.:-]/g, "")}@flowledger>` }
        : {}),
    });
    return { success: true, data: { messageId: info.messageId, to } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { responseCode?: number }).responseCode;
    if (code === 535 || /Invalid login/i.test(message)) {
      return {
        success: false,
        error: { message: "Email login refused: check the app password", class: "auth" },
      };
    }
    if (code && code >= 400 && code < 500) {
      return { success: false, error: { message: `Email server busy: ${message}`, class: "retryable" } };
    }
    if (code && code >= 500) {
      return { success: false, error: { message: `Email rejected: ${message}`, class: "validation" } };
    }
    // Connection-level failures: usually nothing was accepted, so retry. A drop after
    // the server accepted the message can duplicate it (at-least-once, D-019).
    return { success: false, error: { message: `Email failed: ${message}`, class: "retryable" } };
  }
}

export async function sendSmtpEmailStep(input: SendSmtpEmailInput): Promise<SendEmailResult> {
  const credentials = input.integrationId ? await fetchCredentials(input.integrationId) : {};
  return withStepLogging(input, () =>
    stepHandler({ ...input, idempotencyKey: input._context?.idempotencyKey }, credentials)
  );
}

export const _integrationType = "smtp-email";
