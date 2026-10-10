import { describe, expect, it } from "vitest";
import "@/plugins";
import {
  maskSecrets,
  mergeSecrets,
  SECRET_MASK,
} from "@/lib/integrations/secrets";

describe("Connector secrets are write-only", () => {
  it("masks secrets on read but keeps non-secret fields readable", () => {
    expect(
      maskSecrets("telegram", { botToken: "123:abc", chatId: "-100123" })
    ).toEqual({ botToken: SECRET_MASK, chatId: "-100123" });
    expect(
      maskSecrets("smtp-email", {
        user: "nflow.demo@gmail.com",
        password: "abcd efgh ijkl mnop",
        fromName: "Team",
      })
    ).toEqual({
      user: "nflow.demo@gmail.com",
      password: SECRET_MASK,
      fromName: "Team",
    });
    expect(
      maskSecrets("google-sheets", {
        serviceAccountJson: '{"private_key":"x"}',
        spreadsheetId: "1AbC",
      })
    ).toEqual({ serviceAccountJson: SECRET_MASK, spreadsheetId: "1AbC" });
  });

  it("treats key/token/secret-named fields as secret even if unmarked", () => {
    expect(maskSecrets("unknown-type", { apiKey: "k", region: "in" })).toEqual({
      apiKey: SECRET_MASK,
      region: "in",
    });
  });

  it("an edit keeps every stored value it didn't change", () => {
    const stored = { botToken: "123:abc", chatId: "-100123" };
    expect(mergeSecrets("telegram", { chatId: "-100999" }, stored)).toEqual({
      botToken: "123:abc",
      chatId: "-100999",
    });
    expect(
      mergeSecrets("telegram", { botToken: SECRET_MASK, chatId: "" }, stored)
    ).toEqual(stored);
    expect(
      mergeSecrets("telegram", { botToken: "456:new" }, stored).botToken
    ).toBe("456:new");
  });
});
