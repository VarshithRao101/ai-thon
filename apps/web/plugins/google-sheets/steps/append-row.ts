import "server-only";

import type { StepError } from "@flowledger/engine";
import { fetchCredentials } from "@/lib/credential-fetcher";
import { type StepInput, withStepLogging } from "@/lib/steps/step-handler";
import { SheetsError, sheetsFetch, spreadsheetIdFrom } from "../client";
import type { GoogleSheetsCredentials } from "../credentials";

type AppendRowResult =
  | { success: true; data: { rowNumber: number | null; range: string; spreadsheetId: string } }
  | { success: false; error: StepError };

export type AppendRowCoreInput = {
  spreadsheetId?: string;
  sheetName?: string;
  /** One cell per line, in column order. */
  rowValues: string;
};

export type AppendRowInput = StepInput &
  AppendRowCoreInput & {
    integrationId?: string;
  };

type AppendResponse = { updates?: { updatedRange?: string } };

/** "Sheet1!A7:G7" → 7 */
function rowNumberOf(range: string | undefined): number | null {
  const match = /![A-Z]+(\d+)/.exec(range ?? "");
  return match ? Number(match[1]) : null;
}

function quoteSheet(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

async function stepHandler(
  input: AppendRowCoreInput,
  credentials: GoogleSheetsCredentials
): Promise<AppendRowResult> {
  const spreadsheetId = spreadsheetIdFrom(
    input.spreadsheetId || credentials.GOOGLE_SHEETS_SPREADSHEET_ID
  );
  if (!spreadsheetId) {
    return {
      success: false,
      error: { message: "No spreadsheet: set its id or URL on the step or the connection", class: "validation" },
    };
  }
  const values = (input.rowValues ?? "").split(/\r?\n/).map((cell) => cell.trim());
  while (values.length > 0 && values.at(-1) === "") {
    values.pop();
  }
  if (values.length === 0) {
    return { success: false, error: { message: "The row is empty", class: "validation" } };
  }
  const range = input.sheetName?.trim() ? `${quoteSheet(input.sheetName.trim())}!A1` : "A1";

  try {
    const result = await sheetsFetch<AppendResponse>(
      credentials,
      `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values: [values] }) }
    );
    const updatedRange = result.updates?.updatedRange ?? "";
    return {
      success: true,
      data: { rowNumber: rowNumberOf(updatedRange), range: updatedRange, spreadsheetId },
    };
  } catch (error) {
    if (error instanceof SheetsError) {
      return { success: false, error: error.stepError };
    }
    throw error;
  }
}

export async function appendRowStep(input: AppendRowInput): Promise<AppendRowResult> {
  const credentials = input.integrationId ? await fetchCredentials(input.integrationId) : {};
  return withStepLogging(input, () => stepHandler(input, credentials));
}

export const _integrationType = "google-sheets";
