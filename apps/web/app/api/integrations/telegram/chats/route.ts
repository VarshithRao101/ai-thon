import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { getIntegration } from "@/lib/db/integrations";

export const dynamic = "force-dynamic";

const TOKEN = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

type Update = {
  message?: {
    chat?: { id: number; title?: string; first_name?: string; type: string };
  };
  my_chat_member?: { chat?: { id: number; title?: string; type: string } };
  channel_post?: { chat?: { id: number; title?: string; type: string } };
};

/**
 * POST /api/integrations/telegram/chats { botToken } or { integrationId }:
 * "Find my chat id". Asks Telegram which chats recently messaged the bot, so
 * people pick their group instead of digging through getUpdates by hand.
 * The token is used once, server-side, and never stored here.
 */
export const POST = tenantRoute(
  "integrations.telegram.chats",
  async (_ctx, request) => {
    const body = (await request.json().catch(() => ({}))) as {
      botToken?: string;
      integrationId?: string;
    };
    let token = body.botToken?.trim() ?? "";
    if (!token && body.integrationId) {
      const saved = await getIntegration(body.integrationId);
      token = saved?.type === "telegram" ? (saved.config.botToken ?? "") : "";
    }
    if (!TOKEN.test(token)) {
      throw new HttpError(
        400,
        "That doesn't look like a bot token from @BotFather (123456:ABC…)"
      );
    }
    const me = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    if (!me.ok) {
      throw new HttpError(400, "Telegram rejected the bot token");
    }
    const bot = ((await me.json()) as { result?: { username?: string } })
      .result;
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?limit=100`
    );
    const updates = ((await res.json()) as { result?: Update[] }).result ?? [];
    const chats = new Map<
      number,
      { id: string; title: string; type: string }
    >();
    for (const u of updates) {
      const chat =
        u.message?.chat ?? u.my_chat_member?.chat ?? u.channel_post?.chat;
      if (chat) {
        chats.set(chat.id, {
          id: String(chat.id),
          title:
            chat.title ??
            (chat as { first_name?: string }).first_name ??
            "Chat",
          type: chat.type,
        });
      }
    }
    return NextResponse.json({
      bot: bot?.username ?? null,
      chats: [...chats.values()],
    });
  },
  { permission: "integration:manage" }
);
