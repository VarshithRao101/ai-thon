import "server-only";

import { and, asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  apiKeys,
  integrations,
  members,
  sessions,
  users,
  type WorkspaceRole,
  workflowExecutions,
  workflows,
  workspaces,
} from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";
import { generateId } from "@/lib/utils/id";

export type Membership = {
  workspaceId: string;
  name: string;
  role: WorkspaceRole;
  createdAt: Date;
};

const WHITESPACE = /\s+/;
const NON_SLUG_CHARS = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;

/** A fresh, empty workspace younger than this may be merged away on sign-up. */
const FRESH_WORKSPACE_MS = 10 * 60_000;

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(NON_SLUG_CHARS, "-")
      .replace(EDGE_DASHES, "")
      .slice(0, 32) || "workspace"
  );
}

function personalWorkspaceName(user: {
  name?: string | null;
  isAnonymous?: boolean | null;
}): string {
  if (user.isAnonymous) {
    return "Guest workspace";
  }
  const first = user.name?.trim().split(WHITESPACE)[0];
  return first ? `${first}'s workspace` : "My workspace";
}

export function listMemberships(userId: string): Promise<Membership[]> {
  return db
    .select({
      workspaceId: members.organizationId,
      name: workspaces.name,
      role: members.role,
      createdAt: members.createdAt,
    })
    .from(members)
    .innerJoin(workspaces, eq(workspaces.id, members.organizationId))
    .where(eq(members.userId, userId))
    .orderBy(asc(members.createdAt));
}

export async function firstWorkspaceId(userId: string): Promise<string | null> {
  const [first] = await listMemberships(userId);
  return first?.workspaceId ?? null;
}

/**
 * Every user gets a personal workspace they own, created lazily on their first
 * authenticated request (lib/auth/context.ts). Not in a user-create hook:
 * Better Auth runs those after its transaction, which races with guest-account
 * linking. A per-user advisory lock makes concurrent first requests safe.
 */
export async function ensurePersonalWorkspace(user: {
  id: string;
  name?: string | null;
  isAnonymous?: boolean | null;
}): Promise<string> {
  const existing = await firstWorkspaceId(user.id);
  if (existing) {
    return existing;
  }
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`flowledger:personal-ws:${user.id}`}, 0))`
    );
    const [already] = await tx
      .select({ workspaceId: members.organizationId })
      .from(members)
      .where(eq(members.userId, user.id))
      .orderBy(asc(members.createdAt))
      .limit(1);
    if (already) {
      return already.workspaceId;
    }
    const name = personalWorkspaceName(user);
    const workspaceId = generateId();
    await tx.insert(workspaces).values({
      id: workspaceId,
      name,
      slug: `${slugify(name)}-${generateId().slice(0, 6).toLowerCase()}`,
    });
    await tx.insert(members).values({
      organizationId: workspaceId,
      userId: user.id,
      role: "owner",
    });
    return workspaceId;
  });
}

function workspaceIsEmpty(workspaceId: string): Promise<boolean> {
  return tdb(
    async (tx) => {
      const [wf] = await tx.select({ n: count() }).from(workflows);
      const [ints] = await tx.select({ n: count() }).from(integrations);
      const [keys] = await tx.select({ n: count() }).from(apiKeys);
      return (wf?.n ?? 0) + (ints?.n ?? 0) + (keys?.n ?? 0) === 0;
    },
    { workspaceId }
  );
}

/**
 * A guest (anonymous) user signs up or signs in: keep everything they built.
 * Their workspaces move to the real account, creator columns are re-pointed so
 * the anonymous user row can be deleted, and the empty workspace auto-created
 * for a brand-new account is merged away.
 */
export async function linkAnonymousWorkspaces(
  anonymousUserId: string,
  newUserId: string
): Promise<void> {
  const guest = await listMemberships(anonymousUserId);
  const mine = await listMemberships(newUserId);

  for (const membership of guest) {
    await tdb(
      async (tx) => {
        await tx
          .update(workflows)
          .set({ userId: newUserId })
          .where(eq(workflows.userId, anonymousUserId));
        await tx
          .update(workflowExecutions)
          .set({ userId: newUserId })
          .where(eq(workflowExecutions.userId, anonymousUserId));
        await tx
          .update(integrations)
          .set({ userId: newUserId })
          .where(eq(integrations.userId, anonymousUserId));
        await tx
          .update(apiKeys)
          .set({ userId: newUserId })
          .where(eq(apiKeys.userId, anonymousUserId));
      },
      { workspaceId: membership.workspaceId }
    );
    if (!mine.some((m) => m.workspaceId === membership.workspaceId)) {
      await db
        .update(members)
        .set({ userId: newUserId })
        .where(
          and(
            eq(members.organizationId, membership.workspaceId),
            eq(members.userId, anonymousUserId)
          )
        );
    }
  }

  for (const membership of mine) {
    const fresh =
      membership.role === "owner" &&
      Date.now() - membership.createdAt.getTime() < FRESH_WORKSPACE_MS;
    if (!(fresh && guest.length > 0)) {
      continue;
    }
    const [memberCount] = await db
      .select({ n: count() })
      .from(members)
      .where(eq(members.organizationId, membership.workspaceId));
    if (
      memberCount?.n === 1 &&
      (await workspaceIsEmpty(membership.workspaceId))
    ) {
      await db
        .delete(workspaces)
        .where(eq(workspaces.id, membership.workspaceId));
    }
  }

  const guestWorkspace = guest[0];
  if (guestWorkspace) {
    // "Guest workspace" becomes "<Name>'s workspace" now that we know who it is.
    if (guestWorkspace.name === personalWorkspaceName({ isAnonymous: true })) {
      const [owner] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, newUserId))
        .limit(1);
      await db
        .update(workspaces)
        .set({ name: personalWorkspaceName({ name: owner?.name }) })
        .where(eq(workspaces.id, guestWorkspace.workspaceId));
    }
    await db
      .update(sessions)
      .set({ activeOrganizationId: guestWorkspace.workspaceId })
      .where(eq(sessions.userId, newUserId));
  }
}
