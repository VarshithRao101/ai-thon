import { describe, expect, it } from "vitest";
import { isPlaceholderUrl } from "@/lib/ai/placeholder";
import { buildWorkflow, type CopilotPlan } from "@/lib/ai/plan";

describe("Made-up URLs are never built or suggested", () => {
  it("spots placeholder addresses", () => {
    for (const url of [
      "https://api.yourservice.com/submissions",
      "https://example.com/hook",
      "https://your-domain.com/api",
      "https://api.example.org/x",
      "<your endpoint>",
    ]) {
      expect(isPlaceholderUrl(url), url).toBe(true);
    }
  });

  it("leaves real and templated URLs alone", () => {
    for (const url of [
      "https://api.github.com/repos",
      "https://hooks.slack.com/services/T0/B0/x",
      "{{trigger.url}}",
      "",
    ]) {
      expect(isPlaceholderUrl(url), url).toBe(false);
    }
  });

  it("clears a made-up endpoint and asks for the real one", () => {
    const plan: CopilotPlan = {
      name: "Count",
      description: "x",
      trigger: { type: "Manual" },
      steps: [
        {
          id: "count",
          action: "HTTP Request",
          label: "Get count",
          config: [
            { key: "httpMethod", value: "GET" },
            { key: "endpoint", value: "https://api.yourservice.com/count" },
          ],
        },
      ],
    };
    const built = buildWorkflow(plan);
    const step = built.nodes.find((n) => n.type === "action");
    expect(step?.data.config.endpoint).toBe("");
    expect(built.notes.join(" ")).toContain("needs your real URL");
  });
});
