import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiKeys, workflows } from "@/lib/db/schema";
import { runWithTenant, tdb } from "@/lib/db/tenant";
import { startRun } from "@/lib/hive/ingress";
import type { WorkflowNode } from "@/lib/workflow-store";

// On Vercel the run executes in this function after the response (D-047).
export const maxDuration = 300;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Idempotency-Key",
};

// flk_ = ZETA keys; wfb_ = keys issued by the base template
const KEY_PREFIXES = ["flk_", "wfb_"];

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders });
}

type ResolvedKey = {
  id: string;
  workspace_id: string;
  user_id: string;
  scopes: string[] | null;
};

/**
 * Map a presented API key to its workspace. The key hash is looked up through
 * the SECURITY DEFINER function resolve_api_key() (drizzle/0006): the only
 * cross-tenant read, and it returns nothing for revoked or expired keys.
 */
async function resolveApiKey(
  authHeader: string | null
): Promise<
  { ok: true; key: ResolvedKey } | { ok: false; status: number; error: string }
> {
  if (!authHeader) {
    return { ok: false, status: 401, error: "Missing Authorization header" };
  }
  const key = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;
  if (!KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return { ok: false, status: 401, error: "Invalid API key format" };
  }
  const keyHash = createHash("sha256").update(key).digest("hex");
  const rows = (await db.execute(
    sql`select id, workspace_id, user_id, scopes from resolve_api_key(${keyHash})`
  )) as unknown as ResolvedKey[];
  const resolved = rows[0];
  if (!resolved) {
    return { ok: false, status: 401, error: "Invalid API key" };
  }
  if (!(resolved.scopes ?? []).includes("runs:trigger")) {
    return {
      ok: false,
      status: 403,
      error: "API key lacks the runs:trigger scope",
    };
  }
  return { ok: true, key: resolved };
}

export function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workflowId: string }> }
) {
  try {
    const { workflowId } = await context.params;
    const auth = await resolveApiKey(request.headers.get("Authorization"));
    if (!auth.ok) {
      return json({ error: auth.error }, auth.status);
    }
    const tenant = {
      workspaceId: auth.key.workspace_id,
      userId: auth.key.user_id,
    };

    return await runWithTenant(tenant, async () => {
      // A key only reaches workflows in its own workspace (404 otherwise: no existence leak).
      const [workflow] = await tdb((tx) =>
        tx
          .select()
          .from(workflows)
          .where(
            and(
              eq(workflows.id, workflowId),
              eq(workflows.workspaceId, tenant.workspaceId)
            )
          )
          .limit(1)
      );
      if (!workflow) {
        return json({ error: "Workflow not found" }, 404);
      }

      const triggerNode = (workflow.nodes as WorkflowNode[]).find(
        (node) => node.data.type === "trigger"
      );
      if (!triggerNode || triggerNode.data.config?.triggerType !== "Webhook") {
        return json(
          { error: "This workflow is not configured for webhook triggers" },
          400
        );
      }

      const body = await request.json().catch(() => ({}));
      const input =
        body && typeof body === "object" && !Array.isArray(body)
          ? (body as Record<string, unknown>)
          : { body };
      const idempotencyKey =
        request.headers.get("Idempotency-Key")?.slice(0, 200) || undefined;

      // Fire and forget: usage timestamp for the key list
      tdb((tx) =>
        tx
          .update(apiKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(apiKeys.id, auth.key.id))
      ).catch(() => {
        // Non-critical
      });

      // Webhooks run the published version, and only while the workflow is enabled.
      const result = await startRun({
        workflow,
        trigger: "webhook",
        input,
        userId: tenant.userId,
        idempotencyKey,
      });
      if (!result.ok) {
        return json(
          {
            error: result.reason,
            executionId: result.executionId,
            status: "skipped",
          },
          409
        );
      }
      return json({
        executionId: result.executionId,
        status: "queued",
        duplicate: result.duplicate,
      });
    });
  } catch (error) {
    console.error("[Webhook] Failed to start workflow execution:", error);
    return json({ error: "Failed to execute workflow" }, 500);
  }
}
