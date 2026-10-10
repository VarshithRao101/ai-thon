import { and, eq, like } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { linkAnonymousWorkspaces } from "@/lib/auth/workspaces";
import { db } from "@/lib/db";
import { members, users, workspaces } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const COOKIE = "nf_demo_account";
const DEMO_DOMAIN = "@demo.n-flow.test";

/**
 * POST /api/demo-login/claim (D-050): after someone who tested in test mode
 * signs in for real (Google), move that browser's demo workspace (workflows,
 * runs, receipts, connections) into their account, then forget the demo
 * cookie. Safe to call on every dashboard load: it does nothing otherwise.
 */
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  const jar = await cookies();
  const saved = jar.get(COOKIE)?.value;
  const user = session?.user;
  if (!(user && saved) || user.email.endsWith(DEMO_DOMAIN)) {
    return NextResponse.json({ moved: false });
  }
  const demoId = saved.split(".")[0];
  const [demo] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.email, `demo-${demoId}${DEMO_DOMAIN}`))
    .limit(1);
  const res = NextResponse.json({ moved: Boolean(demo) });
  res.cookies.set(COOKIE, "", { path: "/api/demo-login", maxAge: 0 });
  if (!demo || demo.id === user.id) {
    return res;
  }
  const owned = await db
    .select({ id: members.organizationId })
    .from(members)
    .where(eq(members.userId, demo.id));
  await linkAnonymousWorkspaces(demo.id, user.id);
  // "Demo user AB12's workspace" becomes the real owner's.
  for (const { id } of owned) {
    await db
      .update(workspaces)
      .set({ name: `${user.name?.split(" ")[0] || "My"}'s workspace` })
      .where(and(eq(workspaces.id, id), like(workspaces.name, "Demo user%")));
  }
  return res;
}
