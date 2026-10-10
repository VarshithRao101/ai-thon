import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { restoreTamper, simulateTamper } from "@/lib/ledger/integrity";

/** The simulator exists for the live demo; production enables it explicitly. */
function tamperAllowed(): boolean {
  return (
    process.env.DEMO_TAMPER_ENABLED === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

// POST /api/ledger/{executionId}/tamper: simulate a silent insider edit (recorded in tamper_events).
export const POST = tenantRoute<{ executionId: string }>(
  "ledger.tamper",
  async (ctx, _request, { executionId }) => {
    if (!tamperAllowed()) {
      throw new HttpError(403, "The tamper simulator is turned off");
    }
    const edit = await simulateTamper(ctx.workspaceId, executionId, ctx.userId);
    if (!edit) {
      throw new HttpError(404, "Nothing in this run to tamper with");
    }
    return NextResponse.json({ tampered: true, ...edit });
  },
  { permission: "demo:tamper" }
);

// DELETE /api/ledger/{executionId}/tamper: restore every simulated edit on this run.
export const DELETE = tenantRoute<{ executionId: string }>(
  "ledger.restore",
  async (ctx, _request, { executionId }) => {
    const restored = await restoreTamper(ctx.workspaceId, executionId);
    return NextResponse.json({ restored });
  },
  { permission: "demo:tamper" }
);
