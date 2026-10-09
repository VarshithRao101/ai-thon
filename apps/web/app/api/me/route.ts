import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { tenantRoute } from "@/lib/api/route";
import { can, PERMISSIONS, type Permission } from "@/lib/auth/rbac";
import { listMemberships } from "@/lib/auth/workspaces";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";

/**
 * GET /api/me: who am I, which workspace am I acting in, and what may I do.
 * The UI uses `permissions` to hide controls; the server still enforces them.
 * Switch workspace with POST /api/auth/organization/set-active { organizationId }.
 */
export const GET = tenantRoute("me", async (ctx) => {
  const [workspace] = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      plan: workspaces.plan,
      isDemo: workspaces.isDemo,
    })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspaceId))
    .limit(1);
  const memberships = await listMemberships(ctx.userId);

  return NextResponse.json({
    userId: ctx.userId,
    isAnonymous: ctx.isAnonymous,
    workspace: { ...workspace, role: ctx.role },
    memberships: memberships.map((m) => ({
      workspaceId: m.workspaceId,
      name: m.name,
      role: m.role,
    })),
    permissions: (Object.keys(PERMISSIONS) as Permission[]).filter((p) =>
      can(ctx.role, p)
    ),
  });
});
