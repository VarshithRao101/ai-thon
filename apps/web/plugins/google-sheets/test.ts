import { SheetsError, sheetsFetch, spreadsheetIdFrom } from "./client";

/** Gets a token, and reads the default spreadsheet's title if one is set. */
export async function testGoogleSheets(credentials: Record<string, string>) {
  const spreadsheetId = spreadsheetIdFrom(credentials.GOOGLE_SHEETS_SPREADSHEET_ID);
  try {
    if (spreadsheetId) {
      await sheetsFetch(credentials, `/${encodeURIComponent(spreadsheetId)}?fields=properties.title`);
    } else {
      // No sheet to read yet: an invalid id still proves the key works (404, not 401).
      await sheetsFetch(credentials, "/flowledger-connection-check").catch((error: unknown) => {
        if (error instanceof SheetsError && error.stepError.class === "validation") {
          return;
        }
        throw error;
      });
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
