import { describe, expect, it } from "vitest";
import { normalizeConfig } from "@/lib/integrations/normalize";

describe("Connector input is forgiving", () => {
  it("Gmail: trims, lowercases, strips app-password spaces", () => {
    const r = normalizeConfig("smtp-email", {
      user: "  Asha.Rao@Gmail.com ",
      password: "abcd efgh ijkl mnop ",
    });
    expect(r.problems).toEqual([]);
    expect(r.config).toEqual({
      user: "asha.rao@gmail.com",
      password: "abcdefghijklmnop",
    });
  });

  it("Gmail: catches a normal password before trying to log in", () => {
    const r = normalizeConfig("smtp-email", {
      user: "a@gmail.com",
      password: "MyPassword@123",
    });
    expect(r.problems[0]).toContain("16-letter app password");
  });

  it("Sheets: pulls the key out of surrounding text and takes a Sheet link", () => {
    const key = {
      type: "service_account",
      client_email: "x@p.iam.gserviceaccount.com",
      private_key:
        "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
    };
    const r = normalizeConfig("google-sheets", {
      serviceAccountJson: `Here is my key:\n${JSON.stringify(key)}\nthanks`,
      spreadsheetId:
        "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit#gid=0",
    });
    expect(r.problems).toEqual([]);
    expect(JSON.parse(r.config.serviceAccountJson ?? "{}").client_email).toBe(
      key.client_email
    );
    expect(r.config.spreadsheetId).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
  });

  it("Sheets: explains a wrong JSON (e.g. an OAuth client instead of a service account)", () => {
    const r = normalizeConfig("google-sheets", {
      serviceAccountJson: '{"web":{"client_id":"x"}}',
    });
    expect(r.problems[0]).toContain("service account key");
  });

  it("Telegram: strips a pasted 'bot' prefix and checks the chat id", () => {
    const r = normalizeConfig("telegram", {
      botToken: " bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawQ ",
      chatId: " -1001234567890 ",
    });
    expect(r.problems).toEqual([]);
    expect(r.config).toEqual({
      botToken: "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawQ",
      chatId: "-1001234567890",
    });
    expect(
      normalizeConfig("telegram", { chatId: "my group" }).problems[0]
    ).toContain("Find my chats");
  });

  it("a masked secret from an edit form means unchanged", () => {
    expect(
      normalizeConfig("smtp-email", { password: "••••••••", fromName: "Team" })
    ).toEqual({ config: { fromName: "Team" }, problems: [] });
  });
});
