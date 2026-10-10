import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { integrityData } from "@/lib/ledger/integrity";

// GET /api/ledger/{executionId}/integrity: salt + stored step data for layer 3
// of verification. Members of the run's workspace only (RLS + explicit filter).
export const GET = tenantRoute<{ executionId: string }>(
  "ledger.integrity",
  async (ctx, _request, { executionId }) => {
    const data = await integrityData(ctx.workspaceId, executionId);
    if (!data) {
      throw new HttpError(404, "No receipt for this run in your workspace");
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  },
  { permission: "workflow:read" }
);
