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

const BEARER = /^bearer\s+/i;

// Prefix a pasted key must start with, and what people often paste instead.
const KEY_SHAPES: Record<
  string,
  { key: string; prefix: RegExp; hint: string }
> = {
  slack: {
    key: "apiKey",
    prefix: /^xox[bp]-/,
    hint: "A Slack bot token starts with xoxb-",
  },
  stripe: {
    key: "apiKey",
    prefix: /^(sk|rk)_(test|live)_/,
    hint: "Use a Stripe secret key (sk_test_… or sk_live_…), not the publishable pk_ key",
  },
  github: {
    key: "token",
    prefix: /^(ghp_|github_pat_|gho_|ghs_)/,
    hint: "A GitHub token starts with ghp_ or github_pat_",
  },
  linear: {
    key: "apiKey",
    prefix: /^lin_api_/,
    hint: "A Linear API key starts with lin_api_",
  },
  resend: {
    key: "apiKey",
    prefix: /^re_/,
    hint: "A Resend API key starts with re_",
  },
  clerk: {
    key: "clerkSecretKey",
    prefix: /^sk_(test|live)_/,
    hint: "Use the Clerk secret key (sk_test_… or sk_live_…)",
  },
  firecrawl: {
    key: "firecrawlApiKey",
    prefix: /^fc-/,
    hint: "A Firecrawl API key starts with fc-",
  },
  perplexity: {
    key: "apiKey",
    prefix: /^pplx-/,
    hint: "A Perplexity API key starts with pplx-",
  },
  blob: {
    key: "token",
    prefix: /^vercel_blob_rw_/,
    hint: "Use the Blob read/write token (vercel_blob_rw_…)",
  },
};

/** Every other app: trim, drop a pasted "Bearer ", and check key prefixes. */
function generic(
  type: string,
  c: IntegrationConfig,
  problems: string[]
): IntegrationConfig {
  const out: IntegrationConfig = {};
  for (const [k, v] of Object.entries(c)) {
    out[k] = v === undefined ? v : clean(v).replace(BEARER, "");
  }
  const shape = KEY_SHAPES[type];
  const value = shape ? out[shape.key] : undefined;
  if (shape && value && !shape.prefix.test(value)) {
    problems.push(shape.hint);
  }
  if (type === "resend" && out.fromEmail && !EMAIL.test(out.fromEmail)) {
    problems.push("The default sender should be an email address");
  }
  return out;
}

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
  const cleaned = fn ? fn(config, problems) : generic(type, config, problems);
  // Drop empty values so partial edits keep what is stored.
  const out: IntegrationConfig = {};
  for (const [k, v] of Object.entries(cleaned)) {
    if (v !== undefined && v !== "") {
      out[k] = v;
    }
  }
  return { config: out, problems };
}
