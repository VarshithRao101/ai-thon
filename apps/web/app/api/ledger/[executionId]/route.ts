import { NextResponse } from "next/server";
import { getPublicReceipt } from "@/lib/ledger/public";

// GET /api/ledger/{executionId}: public receipt + Merkle proof + batch (no salt, no step data).
export async function GET(
  _request: Request,
  context: { params: Promise<{ executionId: string }> }
) {
  try {
    const { executionId } = await context.params;
    const receipt = await getPublicReceipt(executionId);
    if (!receipt) {
      return NextResponse.json(
        { error: "No receipt for this run yet" },
        { status: 404 }
      );
    }
    return NextResponse.json(receipt, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[ledger] public receipt failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
