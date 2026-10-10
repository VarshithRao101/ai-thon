import "server-only";

import { classifyHttpStatus, type StepError } from "@flowledger/engine";
import { fetchCredentials } from "@/lib/credential-fetcher";
import { type StepInput, withStepLogging } from "@/lib/steps/step-handler";
import type { TelegramCredentials } from "../credentials";

type SendMessageResult =
  | { success: true; data: { messageId: number; chatId: string } }
  | { success: false; error: StepError };

export type SendTelegramCoreInput = {
  telegramChatId?: string;
  telegramText: string;
  telegramParseMode?: string;
};

export type SendTelegramInput = StepInput &
  SendTelegramCoreInput & {
    integrationId?: string;
  };

const MAX_LENGTH = 4096;

async function stepHandler(
  input: SendTelegramCoreInput,
  credentials: TelegramCredentials
): Promise<SendMessageResult> {
  const token = credentials.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return {
      success: false,
      error: { message: "Connect a Telegram bot first (Connections → Telegram)", class: "auth" },
    };
  }
  const chatId = (input.telegramChatId || credentials.TELEGRAM_CHAT_ID || "").trim();
  if (!chatId) {
    return {
      success: false,
      error: { message: "No chat id: set one on the step or on the connection", class: "validation" },
    };
  }
  const text = (input.telegramText || "").slice(0, MAX_LENGTH);
  if (!text.trim()) {
    return { success: false, error: { message: "The message is empty", class: "validation" } };
  }
  const parseMode =
    input.telegramParseMode === "HTML" || input.telegramParseMode === "MarkdownV2"
      ? input.telegramParseMode
      : undefined;

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(parseMode ? { parse_mode: parseMode } : {}),
      disable_web_page_preview: true,
    }),
  });
  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    result?: { message_id: number };
    description?: string;
    parameters?: { retry_after?: number };
  } | null;

  if (!(response.ok && body?.ok && body.result)) {
    const retryAfter = body?.parameters?.retry_after;
    return {
      success: false,
      error: {
        message: `Telegram: ${body?.description ?? `HTTP ${response.status}`}`,
        class: classifyHttpStatus(response.status),
        ...(retryAfter ? { retryAfterMs: retryAfter * 1000 } : {}),
      },
    };
  }
  return { success: true, data: { messageId: body.result.message_id, chatId } };
}

export async function sendTelegramMessageStep(
  input: SendTelegramInput
): Promise<SendMessageResult> {
  const credentials = input.integrationId ? await fetchCredentials(input.integrationId) : {};
  return withStepLogging(input, () => stepHandler(input, credentials));
}

export const _integrationType = "telegram";
