import { NextResponse } from "next/server";

// GET /api/public-config: the public base URL for share links and QR codes.
// On stage this is the tunnel URL (PUBLIC_APP_URL); otherwise the client uses its own origin.
export function GET() {
  const publicUrl = process.env.PUBLIC_APP_URL?.trim() || null;
  return NextResponse.json({ publicUrl });
}
