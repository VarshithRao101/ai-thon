import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { recordAudit } from "@/lib/audit";
import { apiKeys } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";

// flk_ + 32 random bytes (base64url). Only the sha256 hash is stored.
function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `flk_${randomBytes(32).toString("base64url")}`;
  const hash = createHash("sha256").update(key).digest("hex");
  const prefix = key.slice(0, 11); // "flk_" + first 7 chars
  return { key, hash, prefix };
}

// GET: active (non-revoked) keys in the workspace
export const GET = tenantRoute(
  "apikeys.list",
  async (ctx) => {
    const keys = await tdb((tx) =>
      tx
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPrefix: apiKeys.keyPrefix,
          scopes: apiKeys.scopes,
          createdAt: apiKeys.createdAt,
          lastUsedAt: apiKeys.lastUsedAt,
          expiresAt: apiKeys.expiresAt,
        })
        .from(apiKeys)
        .where(
          and(
            eq(apiKeys.workspaceId, ctx.workspaceId),
            isNull(apiKeys.revokedAt)
          )
        )
        .orderBy(desc(apiKeys.createdAt))
    );
    return NextResponse.json(keys);
  },
  { permission: "apikey:manage" }
);

// POST: create a key; the full key is returned exactly once
export const POST = tenantRoute(
  "apikeys.create",
  async (ctx, request) => {
    if (ctx.isAnonymous) {
      throw new HttpError(403, "Sign up to create API keys");
    }
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.slice(0, 100) : null;
    const { key, hash, prefix } = generateApiKey();

    const [created] = await tdb((tx) =>
      tx
        .insert(apiKeys)
        .values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          name,
          keyHash: hash,
          keyPrefix: prefix,
        })
        .returning({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPrefix: apiKeys.keyPrefix,
          createdAt: apiKeys.createdAt,
        })
    );
    if (!created) {
      throw new HttpError(500, "Failed to create API key");
    }
    await recordAudit(
      "apikey.create",
      { type: "api_key", id: created.id },
      { prefix }
    );

    return NextResponse.json({ ...created, key });
  },
  { permission: "apikey:manage" }
);
