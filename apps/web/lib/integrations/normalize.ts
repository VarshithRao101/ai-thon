import type { IntegrationConfig } from "@/lib/types/integration";

/**
 * Forgiving input for connectors (D-056): people paste from emails, PDFs and
 * chats, so trim, strip spaces from app passwords, pull the JSON key out of
 * surrounding text, and accept a Sheet link or a bare id. Returns the cleaned
 * config plus problems we can already see (shown before any network call).
 */
const APP_PASSWORD = /^[a-z]{16}$/i;
const BOT_PREFIX = /^bot/i;
const ZERO_WIDTH = /\u200b/g;
const JSON_BLOCK = /\{[\s\S]*\}/;
const WHITESPACE = /\s+/g;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BOT_TOKEN = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;
const CHAT_ID = /^(-?\d{5,}|@[A-Za-z][A-Za-z0-9_]{4,})$/;
const SHEET_URL = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;
const SHEET_ID = /^[a-zA-Z0-9_-]{20,}$/;

export type Normalized = { config: IntegrationConfig; problems: string[] };

const clean = (v: string | undefined) =>
  (v ?? "").replace(ZERO_WIDTH, "").trim();

function smtp(c: IntegrationConfig, problems: string[]): IntegrationConfig {
  const user = clean(c.user).toLowerCase();
  const password = clean(c.password).replace(WHITESPACE, "");
  if (user && !EMAIL.test(user)) {
    problems.push("The Gmail address doesn't look right");
  }
  if (password && user.endsWith("@gmail.com") && !APP_PASSWORD.test(password)) {
    problems.push(
      "Gmail needs a 16-letter app password, not your normal password"
    );
  }
  return {
    ...c,
    user,
    password,
    fromName: clean(c.fromName) || undefined,
    host: clean(c.host) || undefined,
  };
}

function sheets(c: IntegrationConfig, problems: string[]): IntegrationConfig {
  const out: IntegrationConfig = { ...c };
  const raw = clean(c.serviceAccountJson);
  if (raw) {
    const block = JSON_BLOCK.exec(raw)?.[0] ?? raw;
    try {
      const key = JSON.parse(block) as {
        type?: string;
        client_email?: string;
        private_key?: string;
      };
      if (
        key.type !== "service_account" ||
        !key.client_email ||
        !key.private_key
      ) {
        problems.push(
          "That JSON isn't a service account key (it needs client_email and private_key)"
        );
      }
      out.serviceAccountJson = JSON.stringify(key);
    } catch {
      problems.push(
        "The service account key isn't valid JSON. Paste the whole downloaded file"
      );
    }
  }
  const sheet = clean(c.spreadsheetId);
  if (sheet) {
    const id = SHEET_URL.exec(sheet)?.[1] ?? sheet;
    if (!SHEET_ID.test(id)) {
      problems.push("Paste the Sheet's link from your browser's address bar");
    }
    out.spreadsheetId = id;
  }
  return out;
}

function telegram(c: IntegrationConfig, problems: string[]): IntegrationConfig {
  const botToken = clean(c.botToken).replace(BOT_PREFIX, "");
  const chatId = clean(c.chatId);
  if (botToken && !BOT_TOKEN.test(botToken)) {
    problems.push(
      "The bot token should look like 123456789:ABC… (from @BotFather)"
    );
  }
  if (chatId && !CHAT_ID.test(chatId)) {
    problems.push("Pick your chat with Find my chats (it looks like -100…)");
  }
  return { ...c, botToken, chatId };
}

const MASK = "••••••••";

export function normalizeConfig(
  type: string,
  input: IntegrationConfig
): Normalized {
  const problems: string[] = [];
  // A masked secret sent back from an edit form means "unchanged".
  const config = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== MASK)
  ) as IntegrationConfig;
  const fns: Record<
    string,
    (c: IntegrationConfig, p: string[]) => IntegrationConfig
  > = {
    "smtp-email": smtp,
    "google-sheets": sheets,
    telegram,
  };
  const fn = fns[type];
  const cleaned = fn ? fn(config, problems) : config;
  // Drop empty values so partial edits keep what is stored.
  const out: IntegrationConfig = {};
  for (const [k, v] of Object.entries(cleaned)) {
    if (v !== undefined && v !== "") {
      out[k] = v;
    }
  }
  return { config: out, problems };
}
