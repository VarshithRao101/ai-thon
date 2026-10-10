import type { IntegrationPlugin } from "../registry";
import { registerIntegration } from "../registry";
import { TelegramIcon } from "./icon";

const telegramPlugin: IntegrationPlugin = {
  type: "telegram",
  label: "Telegram",
  description: "Send instant alerts to a Telegram group or chat",
  icon: TelegramIcon,
  formFields: [
    {
      id: "botToken",
      label: "Bot token",
      type: "password",
      placeholder: "123456789:AA...",
      configKey: "botToken",
      envVar: "TELEGRAM_BOT_TOKEN",
      helpText: "Create a bot with ",
      helpLink: { text: "@BotFather", url: "https://t.me/BotFather" },
    },
    {
      id: "chatId",
      label: "Default chat id",
      type: "text",
      placeholder: "-1001234567890",
      configKey: "chatId",
      envVar: "TELEGRAM_CHAT_ID",
      helpText: "Add the bot to your group and send /start there first",
    },
  ],
  testConfig: {
    getTestFunction: async () => {
      const { testTelegram } = await import("./test");
      return testTelegram;
    },
  },
  actions: [
    {
      slug: "send-message",
      label: "Send Telegram Message",
      description: "Post a message to a Telegram group or chat",
      category: "Telegram",
      stepFunction: "sendTelegramMessageStep",
      stepImportPath: "send-message",
      outputFields: [
        { field: "messageId", description: "Telegram message id" },
        { field: "chatId", description: "Chat it was sent to" },
      ],
      configFields: [
        {
          key: "telegramText",
          label: "Message",
          type: "template-textarea",
          placeholder: "New registration: {{Form.name}} ({{AI Classify.label}})",
          example: "New registration: {{@trigger:Form.name}}",
          rows: 4,
          required: true,
        },
        {
          key: "telegramChatId",
          label: "Chat id (optional)",
          type: "template-input",
          placeholder: "Uses the connection's default chat",
        },
        {
          key: "telegramParseMode",
          label: "Formatting",
          type: "select",
          options: [
            { value: "none", label: "Plain text" },
            { value: "HTML", label: "HTML" },
            { value: "MarkdownV2", label: "MarkdownV2" },
          ],
          defaultValue: "none",
        },
      ],
    },
  ],
};

registerIntegration(telegramPlugin);
export default telegramPlugin;
