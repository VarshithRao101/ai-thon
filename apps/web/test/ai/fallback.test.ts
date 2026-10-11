import { describe, expect, it } from "vitest";
import { templateMatch } from "@/lib/ai/templates";

describe("Template stand-in only when it clearly fits", () => {
  it("matches the demo flows strongly", () => {
    for (const prompt of [
      "When someone registers for our hackathon, pick their track with AI, email them a welcome and add them to our sheet",
      "Score every new sales lead from my website form as hot, warm or cold with AI and ping our Telegram",
    ]) {
      expect(templateMatch(prompt).score, prompt).toBeGreaterThanOrEqual(2);
    }
  });

  it("does not stand in for an unrelated request", () => {
    expect(
      templateMatch("Every Friday at 5 PM, post a timesheet reminder").score
    ).toBeLessThan(2);
  });
});
