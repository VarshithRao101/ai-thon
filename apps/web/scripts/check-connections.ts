/**
 * Live connector check for the connections people saved in the app
 * (Gmail SMTP, Google Sheets, Telegram, ...). Runs each one's connection test
 * against the real service; with --send it also does one real action per
 * connector: a Telegram message, an email to the sender's own address, and a
 * row appended to the default sheet.
 *
 *   pnpm --filter @flowledger/web check:connections [--email you@gmail.com] [--send]
 *
 * Prints names and results only, never credentials.
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one pass per saved connection with its report
async function main() {
  const send = process.argv.includes("--send");
  const email = arg("email");
  const postgres = (await import("postgres")).default;
  const { runWithTenant } = await import("../lib/db/tenant");
  const { fetchCredentials } = await import("../lib/credential-fetcher");
  const { connectionTestFor } = await import(
    "../lib/integrations/connection-tests"
  );
  const { getIntegration } = await import("../plugins");

  const sql = postgres(process.env.DATABASE_ADMIN_URL ?? "", {
    max: 1,
    onnotice: () => undefined,
  });
  const rows = await sql<
    {
      id: string;
      type: string;
      name: string;
      workspace_id: string;
      user_id: string;
      email: string;
    }[]
  >`
    select i.id, i.type, i.name, i.workspace_id, i.user_id, u.email
    from integrations i join users u on u.id = i.user_id
    where i.type in ('smtp-email', 'google-sheets', 'telegram', 'ai')
      and u.email not like '%.example.test'
      ${email ? sql`and lower(u.email) = lower(${email})` : sql``}
    order by i.created_at desc`;
  await sql.end();

  if (rows.length === 0) {
    console.log(
      email
        ? `No Gmail/Sheets/Telegram connections saved for ${email} yet. Add them on the dashboard (Your apps → Connect).`
        : "No Gmail/Sheets/Telegram connections saved yet. Add them on the dashboard (Your apps → Connect)."
    );
    process.exit(1);
  }

  let failed = 0;
  for (const row of rows) {
    const plugin = getIntegration(row.type as never);
    const result = await runWithTenant(
      { workspaceId: row.workspace_id, userId: row.user_id } as never,
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: test, then an optional live action
      async () => {
        const creds = (await fetchCredentials(row.id)) as Record<
          string,
          string
        >;
        const test = plugin ? await connectionTestFor(plugin) : null;
        const outcome = test
          ? await test(creds)
          : { success: false, error: "no connection test" };
        let action = "";
        if (send && outcome.success) {
          try {
            action = await liveAction(row.type, creds);
          } catch (error) {
            action = `FAILED: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
        return { outcome, action };
      }
    );
    const ok = result.outcome.success && !result.action.startsWith("FAILED");
    failed += ok ? 0 : 1;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${row.type.padEnd(14)} "${row.name}" (${row.email})  ${result.outcome.success ? "connection test ok" : `connection test: ${result.outcome.error}`}${result.action ? ` | ${result.action}` : ""}`
    );
  }
  console.log(
    failed
      ? `\n${failed} connection(s) need attention.`
      : "\nAll connections work."
  );
  process.exit(failed ? 1 : 0);
}

async function liveAction(
  type: string,
  creds: Record<string, string>
): Promise<string> {
  const stamp = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  });
  if (type === "telegram") {
    const r = await fetch(
      `https://api.telegram.org/bot${creds.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: creds.TELEGRAM_CHAT_ID,
          text: `ZETA connection check (${stamp}): Telegram works.`,
        }),
      }
    );
    const j = (await r.json()) as { ok?: boolean; description?: string };
    return j.ok
      ? "sent a Telegram message"
      : `FAILED: ${j.description ?? r.status}`;
  }
  if (type === "smtp-email") {
    const { createTransport } = await import("../plugins/smtp-email/transport");
    const to = creds.SMTP_USER?.trim();
    await createTransport(creds).sendMail({
      from: { name: creds.SMTP_FROM_NAME?.trim() || "ZETA", address: to },
      to,
      subject: "ZETA connection check",
      text: `Gmail works. Sent ${stamp}.`,
    });
    return `emailed ${to}`;
  }
  if (type === "google-sheets") {
    const { sheetsFetch, spreadsheetIdFrom } = await import(
      "../plugins/google-sheets/client"
    );
    const id = spreadsheetIdFrom(creds.GOOGLE_SHEETS_SPREADSHEET_ID);
    if (!id) {
      return "no default sheet on the connection (skipped the row)";
    }
    const res = await sheetsFetch<{ updates?: { updatedRange?: string } }>(
      creds,
      `/${encodeURIComponent(id)}/values/A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        body: JSON.stringify({ values: [[stamp, "ZETA connection check"]] }),
      }
    );
    return `appended ${res.updates?.updatedRange ?? "a row"}`;
  }
  return "";
}

main().catch((error) => {
  console.error("[check-connections] crashed:", error);
  process.exit(1);
});
