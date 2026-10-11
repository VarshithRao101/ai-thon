import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { planProblems } = await import("@/lib/ai/copilot");

const plan = (actions: string[]) => ({
  name: "x",
  description: "x",
  trigger: { type: "Form" as const },
  steps: actions.map((action, i) => ({
    id: `s${i}`,
    action,
    label: action,
    config: [],
  })),
});

describe("Copilot self-check", () => {
  it("catches an AI-drafted email that is never sent", () => {
    expect(
      planProblems(plan(["ai/draft-email", "google-sheets/append-row"]), "x")
    ).toHaveLength(1);
    expect(
      planProblems(plan(["ai/draft-email", "smtp-email/send-email"]), "x")
    ).toEqual([]);
  });

  it("catches an edit that drops a step nobody asked to remove", () => {
    const summary =
      "- Form: Form\n- Add row: google-sheets/append-row\n- Email: smtp-email/send-email";
    const p = plan(["Delay", "smtp-email/send-email"]);
    expect(
      planProblems(p, "Wait 10 minutes before the email", summary)[0]
    ).toContain("google-sheets/append-row");
    expect(planProblems(p, "Remove the sheet step", summary)).toEqual([]);
  });
});
