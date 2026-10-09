import "server-only";

import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sessions, type WorkspaceRole } from "@/lib/db/schema";
import type { TenantContext } from "@/lib/db/tenant";
import { isWorkspaceRole } from "./rbac";
import { ensurePersonalWorkspace, listMemberships } from "./workspaces";

export type RequestContext = TenantContext & {
  userId: string;
  role: WorkspaceRole;
  isAnonymous: boolean;
  sessionId: string;
};

function hashClientIp(headers: Headers): string | undefined {
  const ip =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    undefined;
  if (!ip) {
    return;
  }
  const key = process.env.BETTER_AUTH_SECRET ?? "flowledger-dev";
  return createHmac("sha256", key).update(ip).digest("hex").slice(0, 32);
}

/**
 * Resolve the signed-in user, their active workspace and role.
 * The active workspace comes from the session; if it is missing or the user is
 * no longer a member, fall back to their oldest membership and remember it.
 */
export async function getRequestContext(
  headers: Headers
): Promise<RequestContext | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) {
    return null;
  }
  const user = session.user as typeof session.user & {
    isAnonymous?: boolean | null;
  };
  let memberships = await listMemberships(user.id);
  if (memberships.length === 0) {
    await ensurePersonalWorkspace(user);
    memberships = await listMemberships(user.id);
  }
  const activeId = (session.session as { activeOrganizationId?: string | null })
    .activeOrganizationId;
  const active =
    memberships.find((m) => m.workspaceId === activeId) ?? memberships[0];
  if (!active) {
    return null;
  }
  if (active.workspaceId !== activeId) {
    await db
      .update(sessions)
      .set({ activeOrganizationId: active.workspaceId })
      .where(eq(sessions.id, session.session.id))
      .catch((error: unknown) => {
        console.error("[context] could not persist active workspace", error);
      });
  }
  return {
    workspaceId: active.workspaceId,
    userId: user.id,
    // An unknown role string gets least privilege, never more.
    role: isWorkspaceRole(active.role) ? active.role : "viewer",
    isAnonymous: Boolean(user.isAnonymous),
    sessionId: session.session.id,
    ipHash: hashClientIp(headers),
    userAgent: headers.get("user-agent") ?? undefined,
  };
}
