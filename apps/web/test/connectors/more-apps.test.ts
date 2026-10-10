import { describe, expect, it } from "vitest";
import { buildWorkflow, makePlanSchema } from "@/lib/ai/plan";
import { pluginCatalog } from "@/lib/ai/plugin-catalog";
import { friendlyTestError } from "@/lib/integrations/friendly";
import { normalizeConfig } from "@/lib/integrations/normalize";
import { getAllIntegrations } from "@/plugins";

describe("More apps: input checks", () => {
  it("trims and drops a pasted Bearer prefix", () => {
    const r = normalizeConfig("slack", { apiKey: "  Bearer xoxb-123-abc  " });
    expect(r.problems).toEqual([]);
    expect(r.config).toEqual({ apiKey: "xoxb-123-abc" });
  });

  it("catches the wrong kind of key before any network call", () => {
    expect(
      normalizeConfig("stripe", { apiKey: "pk_test_123" }).problems[0]
    ).toContain("secret key");
    expect(normalizeConfig("github", { token: "hello" }).problems[0]).toContain(
      "ghp_"
    );
    expect(
      normalizeConfig("resend", { apiKey: "re_1", fromEmail: "nope" })
        .problems[0]
    ).toContain("email");
  });

  it("accepts apps without a known key shape as typed", () => {
    expect(normalizeConfig("webflow", { apiKey: " abc " })).toEqual({
      config: { apiKey: "abc" },
      problems: [],
    });
  });
});

describe("More apps: the AI can use them", () => {
  it("every app with a setup form has at least one action", () => {
    const apps = getAllIntegrations().filter((p) => p.formFields.length > 0);
    expect(apps.length).toBeGreaterThanOrEqual(16);
    for (const p of apps) {
      expect(p.actions.length, p.type).toBeGreaterThan(0);
    }
  });

  it("adds an app's actions when it is connected or named", () => {
    expect(Object.keys(pluginCatalog([], "make a workflow"))).toEqual([]);
    expect(Object.keys(pluginCatalog(["slack"]))).toContain(
      "slack/send-message"
    );
    const named = Object.keys(
      pluginCatalog([], "when a form comes in, open a GitHub issue")
    );
    expect(named).toContain("github/create-issue");
    expect(named.some((k) => k.startsWith("slack/"))).toBe(false);
  });

  it("builds a runnable step and asks to connect a missing app", () => {
    const extra = pluginCatalog([], "post to slack");
    const plan = makePlanSchema(extra).parse({
      name: "Slack alert",
      description: "Alert Slack",
      trigger: { type: "Manual" },
      steps: [
        {
          id: "post",
          action: "slack/send-message",
          label: "Post to Slack",
          config: [
            { key: "slackChannel", value: "#general" },
            { key: "slackMessage", value: "Hi" },
          ],
        },
      ],
    });
    const built = buildWorkflow(plan, {}, extra);
    const step = built.nodes.find((n) => n.type === "action");
    expect(step?.data.config).toMatchObject({
      actionType: "slack/send-message",
      slackChannel: "#general",
    });
    expect(built.notes.join(" ")).toContain("Connect Slack");

    const linked = buildWorkflow(plan, { slack: "int_1" }, extra);
    expect(
      linked.nodes.find((n) => n.type === "action")?.data.config
    ).toMatchObject({ integrationId: "int_1" });
  });
});

describe("More apps: test errors in plain words", () => {
  it("turns provider replies into next steps", () => {
    expect(friendlyTestError("Slack", "invalid_auth")).toContain(
      "Slack rejected this key"
    );
    expect(
      friendlyTestError("Blob", "API validation failed: HTTP 404")
    ).toContain("didn't recognise");
    expect(
      friendlyTestError(
        "Firecrawl",
        '{"success":false,"error":"Unauthorized: Invalid token"}'
      )
    ).toContain("Firecrawl rejected this key");
    expect(
      friendlyTestError("Resend", "API validation failed: HTTP 400")
    ).toContain("refused the details");
    expect(
      friendlyTestError("Gmail", "Sign-in failed: check the app password")
    ).toBe("Sign-in failed: check the app password");
  });
});
