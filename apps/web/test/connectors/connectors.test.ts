import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Connector steps and connection tests (Telegram, Gmail SMTP, Google Sheets)
 * with the network mocked: what we send, and how every failure is classified
 * (auth / validation / retryable) so the engine retries or Run Doctor explains.
 */

const credentials: Record<string, Record<string, string>> = {};
vi.mock("@/lib/credential-fetcher", () => ({
  fetchCredentials: vi.fn(async (id: string) => credentials[id] ?? {}),
}));
vi.mock("@/lib/steps/step-handler", () => ({
  withStepLogging: (_input: unknown, fn: () => unknown) => fn(),
}));

const sendMail = vi.fn();
const verify = vi.fn();
const createTransportSpy = vi.fn((..._args: unknown[]) => ({
  sendMail,
  verify,
}));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: (...args: unknown[]) => createTransportSpy(...args),
  },
}));

const getAccessToken = vi.fn(async () => ({ token: "ya29.test-token" }));
vi.mock("google-auth-library", () => ({
  JWT: class {
    getAccessToken = getAccessToken;
  },
}));

type FetchCall = { url: string; init?: RequestInit };
let calls: FetchCall[] = [];
function mockFetch(
  responder: (
    url: string,
    init?: RequestInit
  ) => {
    status?: number;
    body?: unknown;
    headers?: Record<string, string>;
  }
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const r = responder(url, init);
      return Promise.resolve(
        new Response(JSON.stringify(r.body ?? {}), {
          status: r.status ?? 200,
          headers: { "content-type": "application/json", ...(r.headers ?? {}) },
        })
      );
    })
  );
}
const sentBody = (i = 0) => JSON.parse(String(calls[i]?.init?.body ?? "{}"));

beforeEach(() => {
  calls = [];
  for (const k of Object.keys(credentials)) {
    delete credentials[k];
  }
  sendMail.mockReset();
  verify.mockReset();
  createTransportSpy.mockClear();
  getAccessToken.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const TOKEN = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawQ";

describe("Telegram: send message", () => {
  const load = async () =>
    (await import("@/plugins/telegram/steps/send-message"))
      .sendTelegramMessageStep;

  it("sends to the connection's chat and returns the message id", async () => {
    credentials.tg = { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: "-100123" };
    mockFetch(() => ({ body: { ok: true, result: { message_id: 42 } } }));
    const result = await (await load())({
      integrationId: "tg",
      telegramText: "New registration: Asha",
    } as never);
    expect(result).toEqual({
      success: true,
      data: { messageId: 42, chatId: "-100123" },
    });
    expect(calls[0]?.url).toBe(
      `https://api.telegram.org/bot${TOKEN}/sendMessage`
    );
    expect(sentBody()).toMatchObject({
      chat_id: "-100123",
      text: "New registration: Asha",
      disable_web_page_preview: true,
    });
  });

  it("lets the step override the chat id", async () => {
    credentials.tg = { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: "-100123" };
    mockFetch(() => ({ body: { ok: true, result: { message_id: 1 } } }));
    await (await load())({
      integrationId: "tg",
      telegramChatId: "-100999",
      telegramText: "hi",
    } as never);
    expect(sentBody().chat_id).toBe("-100999");
  });

  it("caps the text at Telegram's 4096-character limit", async () => {
    credentials.tg = { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: "1" };
    mockFetch(() => ({ body: { ok: true, result: { message_id: 1 } } }));
    await (await load())({
      integrationId: "tg",
      telegramText: "x".repeat(5000),
    } as never);
    expect(sentBody().text).toHaveLength(4096);
  });

  it("classifies failures: no connection = auth, empty = validation", async () => {
    const step = await load();
    const noAuth = await step({ telegramText: "hi" } as never);
    expect(noAuth).toMatchObject({ success: false, error: { class: "auth" } });
    credentials.tg = { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: "1" };
    const empty = await step({
      integrationId: "tg",
      telegramText: "   ",
    } as never);
    expect(empty).toMatchObject({
      success: false,
      error: { class: "validation" },
    });
  });

  it("turns 429 into a retry with Telegram's retry_after", async () => {
    credentials.tg = { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: "1" };
    mockFetch(() => ({
      status: 429,
      body: {
        ok: false,
        description: "Too Many Requests: retry after 7",
        parameters: { retry_after: 7 },
      },
    }));
    const result = await (await load())({
      integrationId: "tg",
      telegramText: "hi",
    } as never);
    expect(result).toMatchObject({
      success: false,
      error: { class: "retryable", retryAfterMs: 7000 },
    });
  });

  it("reports a bot removed from the chat (403) as auth", async () => {
    credentials.tg = { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: "1" };
    mockFetch(() => ({
      status: 403,
      body: { ok: false, description: "Forbidden: bot was kicked" },
    }));
    const result = await (await load())({
      integrationId: "tg",
      telegramText: "hi",
    } as never);
    expect(result).toMatchObject({
      success: false,
      error: { class: "auth", message: "Telegram: Forbidden: bot was kicked" },
    });
  });
});

describe("Telegram: connection test", () => {
  const load = async () =>
    (await import("@/plugins/telegram/test")).testTelegram;

  it("rejects a malformed token without calling Telegram", async () => {
    mockFetch(() => ({}));
    const result = await (await load())({ TELEGRAM_BOT_TOKEN: "nope" });
    expect(result.success).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("explains when the bot can't see the chat", async () => {
    mockFetch((url) =>
      url.includes("getChat")
        ? { status: 400, body: { ok: false } }
        : { body: { ok: true } }
    );
    const result = await (await load())({
      TELEGRAM_BOT_TOKEN: TOKEN,
      TELEGRAM_CHAT_ID: "-100123",
    });
    expect(result).toMatchObject({ success: false });
    expect(result.error).toContain("Add the bot to the group");
  });

  it("passes with a valid token and chat", async () => {
    mockFetch(() => ({ body: { ok: true } }));
    expect(
      await (await load())({
        TELEGRAM_BOT_TOKEN: TOKEN,
        TELEGRAM_CHAT_ID: "-1",
      })
    ).toEqual({ success: true });
  });
});

describe("Gmail (SMTP): send email", () => {
  const load = async () =>
    (await import("@/plugins/smtp-email/steps/send-email")).sendSmtpEmailStep;
  const gmail = {
    SMTP_USER: "nflow.demo@gmail.com",
    SMTP_PASSWORD: "abcd efgh ijkl mnop",
    SMTP_FROM_NAME: "Hackathon Team",
  };

  it("sends text + escaped HTML from the connected Gmail", async () => {
    credentials.mail = gmail;
    sendMail.mockResolvedValue({ messageId: "<m1@gmail.com>" });
    const result = await (await load())({
      integrationId: "mail",
      emailTo: " asha@example.test ",
      emailSubject: "You're in!",
      emailBody: "Hi Asha,\n\nTrack: <AI/ML>",
      _context: { idempotencyKey: "run1:email" },
    } as never);
    expect(result).toEqual({
      success: true,
      data: { messageId: "<m1@gmail.com>", to: "asha@example.test" },
    });
    const mail = sendMail.mock.calls[0]?.[0];
    expect(mail.from).toEqual({
      name: "Hackathon Team",
      address: "nflow.demo@gmail.com",
    });
    expect(mail.text).toBe("Hi Asha,\n\nTrack: <AI/ML>");
    expect(mail.html).toContain("&#60;AI/ML&#62;");
    expect(mail.html).not.toContain("<AI/ML>");
    expect(mail.messageId).toBe("<run1:email@flowledger>");
  });

  it("uses Gmail on 465 and strips spaces from the app password", async () => {
    credentials.mail = gmail;
    sendMail.mockResolvedValue({ messageId: "x" });
    await (await load())({
      integrationId: "mail",
      emailTo: "a@b.co",
      emailSubject: "s",
      emailBody: "b",
    } as never);
    expect(createTransportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: "nflow.demo@gmail.com", pass: "abcdefghijklmnop" },
      })
    );
  });

  it("refuses a bad recipient before connecting", async () => {
    credentials.mail = gmail;
    const result = await (await load())({
      integrationId: "mail",
      emailTo: "not-an-email",
      emailSubject: "s",
      emailBody: "b",
    } as never);
    expect(result).toMatchObject({
      success: false,
      error: { class: "validation" },
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it.each([
    [535, "auth"],
    [421, "retryable"],
    [550, "validation"],
  ])("maps SMTP %i to %s", async (code, cls) => {
    credentials.mail = gmail;
    sendMail.mockRejectedValue(
      Object.assign(new Error(`SMTP ${code}`), { responseCode: code })
    );
    const result = await (await load())({
      integrationId: "mail",
      emailTo: "a@b.co",
      emailSubject: "s",
      emailBody: "b",
    } as never);
    expect(result).toMatchObject({ success: false, error: { class: cls } });
  });

  it("needs a connection", async () => {
    const result = await (await load())({
      emailTo: "a@b.co",
      emailSubject: "s",
      emailBody: "b",
    } as never);
    expect(result).toMatchObject({ success: false, error: { class: "auth" } });
  });
});

describe("Gmail (SMTP): connection test", () => {
  const load = async () =>
    (await import("@/plugins/smtp-email/test")).testSmtpEmail;

  it("logs in without sending", async () => {
    verify.mockResolvedValue(true);
    expect(
      await (await load())({ SMTP_USER: "a@gmail.com", SMTP_PASSWORD: "p" })
    ).toEqual({ success: true });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("explains a refused Gmail login", async () => {
    verify.mockRejectedValue(
      new Error("535-5.7.8 Username and Password not accepted")
    );
    const result = await (await load())({
      SMTP_USER: "a@gmail.com",
      SMTP_PASSWORD: "wrong",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("app password");
  });
});

describe("Google Sheets: append row", () => {
  const load = async () =>
    (await import("@/plugins/google-sheets/steps/append-row")).appendRowStep;
  const key = JSON.stringify({
    client_email: "nflow-sheets@n-flow.iam.gserviceaccount.com",
    private_key:
      "-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----\\n",
  });

  it("appends one row (one cell per line) and returns the row number", async () => {
    credentials.sheet = {
      GOOGLE_SERVICE_ACCOUNT_JSON: key,
      GOOGLE_SHEETS_SPREADSHEET_ID:
        "https://docs.google.com/spreadsheets/d/1AbC_dEf-123/edit#gid=0",
    };
    mockFetch(() => ({ body: { updates: { updatedRange: "Sheet1!A7:G7" } } }));
    const result = await (await load())({
      integrationId: "sheet",
      rowValues: "2026-10-10 18:00\nAsha Rao\nasha@example.test\n\n",
    } as never);
    expect(result).toEqual({
      success: true,
      data: {
        rowNumber: 7,
        range: "Sheet1!A7:G7",
        spreadsheetId: "1AbC_dEf-123",
      },
    });
    expect(calls[0]?.url).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/1AbC_dEf-123/values/A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS"
    );
    expect(sentBody()).toEqual({
      values: [["2026-10-10 18:00", "Asha Rao", "asha@example.test"]],
    });
    expect(
      (calls[0]?.init?.headers as Record<string, string>).Authorization
    ).toBe("Bearer ya29.test-token");
  });

  it("quotes a named tab", async () => {
    credentials.sheet = {
      GOOGLE_SERVICE_ACCOUNT_JSON: key,
      GOOGLE_SHEETS_SPREADSHEET_ID: "id1",
    };
    mockFetch(() => ({ body: { updates: { updatedRange: "'Leads'!A2:B2" } } }));
    await (await load())({
      integrationId: "sheet",
      sheetName: "Rahul's Leads",
      rowValues: "a",
    } as never);
    expect(decodeURIComponent(calls[0]?.url ?? "")).toContain(
      "/values/'Rahul''s Leads'!A1:append"
    );
  });

  it("tells you to share the sheet when Google says 403", async () => {
    credentials.sheet = {
      GOOGLE_SERVICE_ACCOUNT_JSON: key,
      GOOGLE_SHEETS_SPREADSHEET_ID: "id1",
    };
    mockFetch(() => ({
      status: 403,
      body: { error: { message: "The caller does not have permission" } },
    }));
    const result = await (await load())({
      integrationId: "sheet",
      rowValues: "a",
    } as never);
    expect(result).toMatchObject({ success: false, error: { class: "auth" } });
    expect((result as { error: { message: string } }).error.message).toContain(
      "share the Sheet with nflow-sheets@n-flow.iam.gserviceaccount.com"
    );
  });

  it("classifies a bad key (auth), no sheet and an empty row (validation)", async () => {
    const step = await load();
    credentials.bad = {
      GOOGLE_SERVICE_ACCOUNT_JSON: "{not json",
      GOOGLE_SHEETS_SPREADSHEET_ID: "id1",
    };
    mockFetch(() => ({}));
    expect(
      await step({ integrationId: "bad", rowValues: "a" } as never)
    ).toMatchObject({ success: false, error: { class: "auth" } });
    credentials.nosheet = { GOOGLE_SERVICE_ACCOUNT_JSON: key };
    expect(
      await step({ integrationId: "nosheet", rowValues: "a" } as never)
    ).toMatchObject({ success: false, error: { class: "validation" } });
    credentials.sheet = {
      GOOGLE_SERVICE_ACCOUNT_JSON: key,
      GOOGLE_SHEETS_SPREADSHEET_ID: "id1",
    };
    expect(
      await step({ integrationId: "sheet", rowValues: "\n\n" } as never)
    ).toMatchObject({ success: false, error: { class: "validation" } });
  });

  it("retries on Google rate limits with Retry-After", async () => {
    credentials.sheet = {
      GOOGLE_SERVICE_ACCOUNT_JSON: key,
      GOOGLE_SHEETS_SPREADSHEET_ID: "id1",
    };
    mockFetch(() => ({
      status: 429,
      body: { error: { message: "Quota exceeded" } },
      headers: { "retry-after": "5" },
    }));
    const result = await (await load())({
      integrationId: "sheet",
      rowValues: "a",
    } as never);
    expect(result).toMatchObject({
      success: false,
      error: { class: "retryable", retryAfterMs: 5000 },
    });
  });
});
