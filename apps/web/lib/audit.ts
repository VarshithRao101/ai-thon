import "server-only";

import { auditEvents } from "@/lib/db/schema";
import { currentTenant, tdb } from "@/lib/db/tenant";

export type AuditAction =
  | "workflow.create"
  | "workflow.delete"
  | "workflow.visibility_change"
  | "integration.create"
  | "integration.update"
  | "integration.delete"
  | "apikey.create"
  | "apikey.revoke"
  | "vault.rotate"
  | "workflow.publish"
  | "workflow.enable"
  | "workflow.disable"
  | "run.retry";

/**
 * Append to the workspace audit trail (docs/10). Best effort: a failed audit
 * write is logged loudly but never undoes the user's action.
 */
export async function recordAudit(
  action: AuditAction,
  target?: { type: string; id: string },
  metadata?: Record<string, unknown>
): Promise<void> {
  const context = currentTenant();
  if (!context) {
    console.error("[audit] no tenant context for", action);
    return;
  }
  try {
    await tdb(
      (tx) =>
        tx.insert(auditEvents).values({
          workspaceId: context.workspaceId,
          actorUserId: context.userId ?? null,
          action,
          targetType: target?.type ?? null,
          targetId: target?.id ?? null,
          ipHash: context.ipHash ?? null,
          userAgent: context.userAgent?.slice(0, 300) ?? null,
          metadata: metadata ?? null,
        }),
      context
    );
  } catch (error) {
    console.error("[audit] failed to record", action, error);
  }
}
