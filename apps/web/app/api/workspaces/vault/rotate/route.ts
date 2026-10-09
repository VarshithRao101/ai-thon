import { NextResponse } from "next/server";
import { tenantRoute } from "@/lib/api/route";
import { recordAudit } from "@/lib/audit";
import { rotateWorkspaceMasterKey } from "@/lib/vault";

/**
 * POST /api/workspaces/vault/rotate
 * Re-wrap the active workspace's data key under the newest master key
 * (VAULT_MASTER_KEY_V<n>). Sealed secrets stay valid: envelope encryption.
 */
export const POST = tenantRoute(
  "vault.rotate",
  async (ctx) => {
    const result = await rotateWorkspaceMasterKey(ctx.workspaceId);
    await recordAudit(
      "vault.rotate",
      { type: "workspace", id: ctx.workspaceId },
      {
        fromVersion: result.from,
        toVersion: result.to,
        rotated: result.rotated,
      }
    );
    return NextResponse.json(result);
  },
  { permission: "vault:rotate" }
);
