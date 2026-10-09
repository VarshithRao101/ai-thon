import { and, desc, eq, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { tenantRoute } from "@/lib/api/route";
import { auditEvents, users } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";

const PAGE_SIZE = 100;

/** GET /api/audit?before=<iso>: the workspace audit trail, newest first. */
export const GET = tenantRoute(
  "audit.list",
  async (ctx, request) => {
    const before = new URL(request.url).searchParams.get("before");
    const beforeDate = before ? new Date(before) : null;
    const events = await tdb((tx) =>
      tx
        .select({
          id: auditEvents.id,
          action: auditEvents.action,
          targetType: auditEvents.targetType,
          targetId: auditEvents.targetId,
          metadata: auditEvents.metadata,
          at: auditEvents.at,
          actor: users.name,
        })
        .from(auditEvents)
        .leftJoin(users, eq(users.id, auditEvents.actorUserId))
        .where(
          and(
            eq(auditEvents.workspaceId, ctx.workspaceId),
            beforeDate && !Number.isNaN(beforeDate.getTime())
              ? lt(auditEvents.at, beforeDate)
              : undefined
          )
        )
        .orderBy(desc(auditEvents.at))
        .limit(PAGE_SIZE)
    );
    return NextResponse.json(events);
  },
  { permission: "audit:read" }
);
