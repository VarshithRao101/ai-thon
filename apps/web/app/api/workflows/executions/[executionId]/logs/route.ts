import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { workflowExecutionLogs, workflowExecutions } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";
import { redactSensitiveData } from "@/lib/utils/redact";

export const GET = tenantRoute<{ executionId: string }>(
  "executions.logs",
  async (ctx, _request, { executionId }) => {
    const result = await tdb(async (tx) => {
      const execution = await tx.query.workflowExecutions.findFirst({
        where: and(
          eq(workflowExecutions.id, executionId),
          eq(workflowExecutions.workspaceId, ctx.workspaceId)
        ),
        with: { workflow: true },
      });
      if (!execution) {
        return null;
      }
      const logs = await tx
        .select()
        .from(workflowExecutionLogs)
        .where(eq(workflowExecutionLogs.executionId, executionId))
        .orderBy(desc(workflowExecutionLogs.timestamp));
      return { execution, logs };
    });

    if (!result) {
      throw new HttpError(404, "Execution not found");
    }

    // Defense in depth: data is redacted when stored; redact again on the way out.
    return NextResponse.json({
      execution: result.execution,
      logs: result.logs.map((log) => ({
        ...log,
        input: redactSensitiveData(log.input),
        output: redactSensitiveData(log.output),
      })),
    });
  },
  { permission: "workflow:read" }
);
