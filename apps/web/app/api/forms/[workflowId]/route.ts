import { and, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { workflowExecutions } from "@/lib/db/schema";
import { runWithTenant, tdb } from "@/lib/db/tenant";
import { submittedAtIst, validateSubmission } from "@/lib/forms/schema";
import { allowSubmission, clientKey, loadPublicForm } from "@/lib/forms/server";
import { startRun } from "@/lib/hive/ingress";

// On Vercel the run executes in this function after the response (D-047).
export const maxDuration = 300;
const SUBMISSION_ID = /^[a-zA-Z0-9_-]{8,64}$/;

// POST /api/forms/{workflowId}: public submission of a hosted form (no sign-in).
export async function POST(
  request: Request,
  context: { params: Promise<{ workflowId: string }> }
) {
  try {
    const { workflowId } = await context.params;
    if (!allowSubmission(`${clientKey(request.headers)}:${workflowId}`)) {
      return NextResponse.json(
        { error: "Too many submissions. Please wait a minute." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid submission" },
        { status: 400 }
      );
    }

    const target = await loadPublicForm(workflowId);
    if (!target) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }

    // Honeypot: bots fill the hidden "website" field. Pretend success, run nothing.
    if (typeof body.website === "string" && body.website.trim() !== "") {
      return NextResponse.json({
        ok: true,
        message: target.form.submitMessage,
      });
    }

    if (!target.open) {
      return NextResponse.json(
        { error: "This form is not accepting responses right now." },
        { status: 409 }
      );
    }

    const values = (body.values ?? {}) as Record<string, unknown>;
    const checked = validateSubmission(target.form, {
      ...values,
      consent: body.consent,
    });
    if (!checked.ok) {
      return NextResponse.json(
        { error: "Please fix the highlighted fields", errors: checked.errors },
        { status: 422 }
      );
    }

    const submissionId =
      typeof body.submissionId === "string" &&
      SUBMISSION_ID.test(body.submissionId)
        ? body.submissionId
        : undefined;

    const result = await runWithTenant(target.tenant, async () => {
      // 1 for the first submission, 2 for the second… ("only the first 5").
      const [prior] = await tdb((tx) =>
        tx
          .select({ n: count() })
          .from(workflowExecutions)
          .where(
            and(
              eq(workflowExecutions.workflowId, target.workflow.id),
              eq(workflowExecutions.trigger, "form")
            )
          )
      );
      return startRun({
        workflow: target.workflow,
        trigger: "form",
        input: {
          ...checked.values,
          submittedAt: submittedAtIst(),
          submissionNumber: (prior?.n ?? 0) + 1,
          consent: Boolean(target.form.consentText),
        },
        userId: target.workflow.userId,
        // A double-click or a retry on a flaky network submits once.
        idempotencyKey: submissionId ? `form:${submissionId}` : undefined,
      });
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: "This form is not accepting responses right now." },
        { status: 409 }
      );
    }
    return NextResponse.json({
      ok: true,
      executionId: result.executionId,
      message: target.form.submitMessage,
    });
  } catch (error) {
    console.error("[forms] submission failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
