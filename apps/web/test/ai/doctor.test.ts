import { describe, expect, it } from "vitest";
import { ruleDiagnosis } from "@/lib/ai/doctor";
import type { Definition } from "@/lib/hive/definition";

const definition: Definition = {
  nodes: [
    {
      id: "t1",
      type: "trigger",
      data: {
        label: "Form",
        type: "trigger",
        enabled: true,
        config: { triggerType: "Form" },
      },
    },
    {
      id: "m1",
      type: "action",
      data: {
        label: "Email participant",
        type: "action",
        enabled: true,
        config: {
          actionType: "smtp-email/send-email",
          emailTo: "{{@t1:Form.mail}}",
        },
      },
    },
  ],
  edges: [{ id: "e", source: "t1", target: "m1", sourceHandle: null }],
};

describe("Run Doctor rules", () => {
  it("fixes an email step pointed at a field that does not exist", () => {
    const d = ruleDiagnosis({
      definition,
      failedNodeId: "m1",
      error: '"(empty)" is not a valid email address',
      errorClass: "validation",
      input: { emailTo: "" },
    });
    expect(d.fix).toEqual({
      nodeId: "m1",
      key: "emailTo",
      value: "{{@t1:Form.email}}",
      label: "To → Email",
    });
    expect(d.cause).toContain("Email participant");
  });

  it("sends auth failures to Connections", () => {
    const d = ruleDiagnosis({
      definition,
      failedNodeId: "m1",
      error: "Email login refused: check the app password",
      errorClass: "auth",
      input: {},
    });
    expect(d.reconnect).toBe("smtp-email");
    expect(d.fix).toBeNull();
    expect(d.suggestion).toContain("Connections");
  });

  it("offers a retry for transient failures", () => {
    const d = ruleDiagnosis({
      definition,
      failedNodeId: "m1",
      error: "Email server busy",
      errorClass: "retryable",
      input: {},
    });
    expect(d.retryable).toBe(true);
  });
});
