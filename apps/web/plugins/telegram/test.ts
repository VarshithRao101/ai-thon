const TOKEN_PATTERN = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

/** Checks the bot token with getMe, and the chat id (if given) with getChat. */
export async function testTelegram(credentials: Record<string, string>) {
  const token = credentials.TELEGRAM_BOT_TOKEN?.trim();
  if (!(token && TOKEN_PATTERN.test(token))) {
    return {
      success: false,
      error: "That doesn't look like a bot token (from @BotFather: 123456:ABC...)",
    };
  }
  try {
    const me = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    if (!me.ok) {
      return { success: false, error: "Telegram rejected the bot token" };
    }
    const chatId = credentials.TELEGRAM_CHAT_ID?.trim();
    if (chatId) {
      const chat = await fetch(
        `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`
      );
      if (!chat.ok) {
        return {
          success: false,
          error: "The bot can't see that chat. Add the bot to the group, then send /start in it.",
        };
      }
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Could not reach Telegram: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
