import "server-only";

import { eq } from "drizzle-orm";
import { workflowExecutions } from "@/lib/db/schema";
import { runWithTenant, type TenantContext, tdb } from "@/lib/db/tenant";
import {
  executeWorkflow,
  type WorkflowExecutionInput,
} from "@/lib/workflow-executor.workflow";

/**
 * The single seam between trigger ingress (execute API, webhooks, forms) and
 * the execution runtime.
 *
 * P1A: runs the executor in-process, fire-and-forget. This replaces Workflow
 * DevKit's `start()`.
 * P1C: becomes an enqueue onto the Hive `runs` queue, consumed by worker processes.
 *
 * The run executes inside the workspace's tenant context, so every database
 * write (step logs, credential reads) is confined to that workspace by RLS.
 */
export function dispatchExecution(
  input: WorkflowExecutionInput,
  tenant: TenantContext
): void {
  runWithTenant(tenant, () => executeWorkflow(input)).catch(
    async (error: unknown) => {
      console.error(
        "[Dispatch] Execution crashed outside the executor:",
        input.executionId,
        error
      );
      if (!input.executionId) {
        return;
      }
      await tdb(
        (tx) =>
          tx
            .update(workflowExecutions)
            .set({
              status: "error",
              error: "Execution crashed unexpectedly",
              completedAt: new Date(),
            })
            .where(eq(workflowExecutions.id, input.executionId as string)),
        tenant
      ).catch((dbError: unknown) => {
        console.error(
          "[Dispatch] Could not mark execution as failed:",
          dbError
        );
      });
    }
  );
}
