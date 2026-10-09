import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { recordAudit } from "@/lib/audit";
import { apiKeys } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";

// DELETE: revoke (soft delete keeps the audit trail; resolve_api_key ignores revoked keys)
export const DELETE = tenantRoute<{ keyId: string }>(
  "apikeys.revoke",
  async (ctx, _request, { keyId }) => {
    const revoked = await tdb((tx) =>
      tx
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(apiKeys.id, keyId),
            eq(apiKeys.workspaceId, ctx.workspaceId),
            isNull(apiKeys.revokedAt)
          )
        )
        .returning({ id: apiKeys.id, keyPrefix: apiKeys.keyPrefix })
    );
    if (revoked.length === 0) {
      throw new HttpError(404, "API key not found");
    }
    await recordAudit(
      "apikey.revoke",
      { type: "api_key", id: keyId },
      { prefix: revoked[0]?.keyPrefix }
    );
    return NextResponse.json({ success: true });
  },
  { permission: "apikey:manage" }
);
