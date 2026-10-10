import { NextResponse } from "next/server";
import { tenantRoute } from "@/lib/api/route";
import { PLANS } from "@/lib/billing/plans";
import { getUsage } from "@/lib/billing/usage";

export const dynamic = "force-dynamic";

// GET /api/usage: the workspace's plan, credits used, and all plans.
export const GET = tenantRoute("usage.read", async () =>
  NextResponse.json({ ...(await getUsage()), plans: Object.values(PLANS) })
);
