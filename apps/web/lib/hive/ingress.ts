import "server-only";

import { and, eq } from "drizzle-orm";
import {
  type ExecutionTrigger,
  type Workflow,
  workflowExecutions,
} from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";
import { getBoss } from "./boss";
import { normalizeDefinition } from "./definition";
import { kickHive } from "./drain";
import { publishEvent } from "./events";
import { QUEUES, type RunJobData } from "./queues";

export type StartRunInput = {
  workflow: Workflow;
  trigger: ExecutionTrigger;
  input: Record<string, unknown>;
  userId: string;
  /** Same key → same execution (webhook retries, double-submitted forms). */
  idempotencyKey?: string;
  /**
   * Manual test runs execute the current canvas draft. Every other trigger runs
   * the published version, and only while the workflow is enabled.
   */
  useDraft?: boolean;
};

export type StartRunResult =
  | { ok: true; executionId: string; duplicate: boolean }
  | { ok: false; code: 409; executionId: string; reason: string };

/** Put a run on the Hive queue. Replaces the template's in-process dispatch. */
export async function startRun(
  options: StartRunInput
): Promise<StartRunResult> {
  const {
    workflow,
    trigger,
    input,
    userId,
    idempotencyKey,
    useDraft = false,
  } = options;
  const workspaceId = workflow.workspaceId;

  if (!(useDraft || (workflow.enabled && workflow.publishedVersionId))) {
    // Logged as "skipped" so the owner can see a disabled workflow was hit.
    const [skipped] = await tdb((tx) =>
      tx
        .insert(workflowExecutions)
        .values({
          workspaceId,
          workflowId: workflow.id,
          userId,
          status: "skipped",
          trigger,
          input,
          error: workflow.publishedVersionId
            ? "Workflow is disabled"
            : "Workflow is not published",
          completedAt: new Date(),
          duration: "0",
        })
        .returning({ id: workflowExecutions.id })
    );
    return {
      ok: false,
      code: 409,
      executionId: skipped?.id ?? "",
      reason: workflow.publishedVersionId
        ? "Workflow is disabled"
        : "Workflow is not published",
    };
  }

  if (idempotencyKey) {
    const [existing] = await tdb((tx) =>
      tx
        .select({ id: workflowExecutions.id })
        .from(workflowExecutions)
        .where(
          and(
            eq(workflowExecutions.workflowId, workflow.id),
            eq(workflowExecutions.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1)
    );
    if (existing) {
      return { ok: true, executionId: existing.id, duplicate: true };
    }
  }

  const inserted = await tdb((tx) =>
    tx
      .insert(workflowExecutions)
      .values({
        workspaceId,
        workflowId: workflow.id,
        userId,
        status: "queued",
        trigger,
        input,
        idempotencyKey: idempotencyKey ?? null,
        ...(useDraft
          ? { definition: normalizeDefinition(workflow.nodes, workflow.edges) }
          : { versionId: workflow.publishedVersionId }),
      })
      .onConflictDoNothing()
      .returning({ id: workflowExecutions.id })
  );
  const created = inserted[0];
  if (!created) {
    // Lost an idempotency race with a concurrent identical request.
    const [existing] = await tdb((tx) =>
      tx
        .select({ id: workflowExecutions.id })
        .from(workflowExecutions)
        .where(
          and(
            eq(workflowExecutions.workflowId, workflow.id),
            eq(workflowExecutions.idempotencyKey, idempotencyKey ?? "")
          )
        )
        .limit(1)
    );
    if (!existing) {
      throw new Error("Could not create the execution");
    }
    return { ok: true, executionId: existing.id, duplicate: true };
  }

  await enqueueRun({ executionId: created.id, workspaceId });
  return { ok: true, executionId: created.id, duplicate: false };
}

/** Send a run job; marks the execution failed if the queue is unreachable. */
export async function enqueueRun(
  data: RunJobData,
  startAfter?: Date
): Promise<void> {
  try {
    const boss = await getBoss();
    const jobId = await boss.send(
      QUEUES.runs,
      data,
      startAfter ? { startAfter } : undefined
    );
    await tdb(
      (tx) =>
        tx
          .update(workflowExecutions)
          .set({ jobId })
          .where(eq(workflowExecutions.id, data.executionId)),
      { workspaceId: data.workspaceId }
    );
    await publishEvent({
      workspaceId: data.workspaceId,
      executionId: data.executionId,
      kind: "run",
      status: data.resume ? "waiting" : "queued",
    });
    if (!(startAfter || data.resume)) {
      kickHive();
    }
  } catch (error) {
    await tdb(
      (tx) =>
        tx
          .update(workflowExecutions)
          .set({
            status: "error",
            error: "Could not queue the run",
            completedAt: new Date(),
          })
          .where(eq(workflowExecutions.id, data.executionId)),
      { workspaceId: data.workspaceId }
    ).catch(() => undefined);
    throw error;
  }
}
