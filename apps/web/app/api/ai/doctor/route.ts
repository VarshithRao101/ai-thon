import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { diagnose } from "@/lib/ai/doctor";
import { HttpError, tenantRoute } from "@/lib/api/route";
import {
  workflowExecutionLogs,
  workflowExecutions,
  workflowVersions,
} from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";
import type { Definition } from "@/lib/hive/definition";

// POST /api/ai/doctor { executionId }: explain the failed step and propose a fix.
export const POST = tenantRoute(
  "ai.doctor",
  async (ctx, request) => {
    const body = (await request.json().catch(() => ({}))) as {
      executionId?: unknown;
    };
    const executionId =
      typeof body.executionId === "string" ? body.executionId : "";
    const result = await tdb(async (tx) => {
      const [execution] = await tx
        .select()
        .from(workflowExecutions)
        .where(
          and(
            eq(workflowExecutions.id, executionId),
            eq(workflowExecutions.workspaceId, ctx.workspaceId)
          )
        )
        .limit(1);
      if (!execution) {
        return null;
      }
      let definition = execution.definition as Definition | null;
      if (execution.versionId) {
        const versionId = execution.versionId;
        const [version] = await tx
          .select({ definition: workflowVersions.definition })
          .from(workflowVersions)
          .where(eq(workflowVersions.id, versionId))
          .limit(1);
        definition = (version?.definition as Definition | undefined) ?? null;
      }
      const [failed] = await tx
        .select()
        .from(workflowExecutionLogs)
        .where(
          and(
            eq(workflowExecutionLogs.executionId, executionId),
            eq(workflowExecutionLogs.status, "error")
          )
        )
        .orderBy(desc(workflowExecutionLogs.startedAt))
        .limit(1);
      return { execution, definition, failed };
    });
    if (!result) {
      throw new HttpError(404, "Run not found");
    }
    if (!(result.failed && result.definition)) {
      throw new HttpError(409, "This run has no failed step to diagnose");
    }
    const diagnosis = await diagnose({
      definition: result.definition,
      failedNodeId: result.failed.nodeId,
      error: result.failed.error ?? "Unknown error",
      errorClass: result.failed.errorClass,
      input: result.failed.input,
    });
    return NextResponse.json({
      ...diagnosis,
      failedNodeId: result.failed.nodeId,
      // Fixes apply to the draft; a test run then uses the fixed draft.
      fromDraft: !result.execution.versionId,
    });
  },
  { permission: "run:operate" }
);
