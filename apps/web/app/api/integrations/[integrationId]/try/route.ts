import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { db } from "@/lib/db";
import { getIntegration } from "@/lib/db/integrations";
import { users } from "@/lib/db/schema";
import { getCredentialMapping, getIntegration as getPlugin } from "@/plugins";
import { sheetsFetch, spreadsheetIdFrom } from "@/plugins/google-sheets/client";
import { createTransport } from "@/plugins/smtp-email/transport";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/[id]/try: one REAL action with a saved connection,
 * so people see it work before building anything. Telegram: a message to the
 * saved chat. Gmail: an email to the signed-in person. Sheets: one row in the
 * saved sheet. Credentials stay on the server.
 */
export const POST = tenantRoute<{ integrationId: string }>(
  "integrations.try",
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one real action per connector type
  async (ctx, _request, { integrationId }) => {
    const integration = await getIntegration(integrationId);
    const plugin = integration ? getPlugin(integration.type) : undefined;
    if (!(integration && plugin)) {
      throw new HttpError(404, "Connection not found");
    }
    const creds = getCredentialMapping(plugin, integration.config) as Record<
      string,
      string
    >;
    const stamp = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    });
    try {
      if (integration.type === "telegram") {
        const r = await fetch(
          `https://api.telegram.org/bot${creds.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: creds.TELEGRAM_CHAT_ID,
              text: `ZETA test (${stamp}): your Telegram connection works.`,
            }),
          }
        );
        const j = (await r.json()) as { ok?: boolean; description?: string };
        if (!j.ok) {
          throw new Error(j.description ?? `HTTP ${r.status}`);
        }
        return NextResponse.json({
          ok: true,
          message: "Sent a test message to your Telegram chat",
        });
      }
      if (integration.type === "smtp-email") {
        const [me] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, ctx.userId))
          .limit(1);
        const to =
          me?.email && !me.email.endsWith(".test") ? me.email : creds.SMTP_USER;
        await createTransport(creds).sendMail({
          from: {
            name: creds.SMTP_FROM_NAME?.trim() || "ZETA",
            address: creds.SMTP_USER?.trim() ?? "",
          },
          to,
          subject: "ZETA test: your Gmail connection works",
          text: `This email was sent by ZETA through your Gmail connection at ${stamp}.`,
        });
        return NextResponse.json({
          ok: true,
          message: `Sent a test email to ${to}`,
        });
      }
      if (integration.type === "google-sheets") {
        const id = spreadsheetIdFrom(creds.GOOGLE_SHEETS_SPREADSHEET_ID);
        if (!id) {
          throw new Error("Add your Sheet link to this connection first");
        }
        const res = await sheetsFetch<{ updates?: { updatedRange?: string } }>(
          creds,
          `/${encodeURIComponent(id)}/values/A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
          {
            method: "POST",
            body: JSON.stringify({ values: [[stamp, "ZETA test row"]] }),
          }
        );
        return NextResponse.json({
          ok: true,
          message: `Added a test row (${res.updates?.updatedRange ?? "new row"})`,
        });
      }
      throw new HttpError(400, "This connection has no test action");
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      return NextResponse.json(
        {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        },
        { status: 200 }
      );
    }
  },
  { permission: "integration:manage" }
);
