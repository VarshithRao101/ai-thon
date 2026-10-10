import "server-only";

import { classifyHttpStatus, parseRetryAfter, type StepError } from "@flowledger/engine";
import { JWT } from "google-auth-library";
import type { GoogleSheetsCredentials } from "./credentials";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const API = "https://sheets.googleapis.com/v4/spreadsheets";

type ServiceAccount = { client_email: string; private_key: string };

export class SheetsError extends Error {
  readonly stepError: StepError;

  constructor(stepError: StepError) {
    super(stepError.message);
    this.stepError = stepError;
  }
}

export function parseServiceAccount(raw: string | undefined): ServiceAccount {
  if (!raw?.trim()) {
    throw new SheetsError({
      message: "Connect Google Sheets first: paste the service account JSON key",
      class: "auth",
    });
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (parsed.client_email && parsed.private_key) {
      return { client_email: parsed.client_email, private_key: parsed.private_key };
    }
  } catch {
    // fall through
  }
  throw new SheetsError({
    message: "The service account key is not valid JSON with client_email and private_key",
    class: "auth",
  });
}

/** Accepts a bare id or a full Sheets URL. */
export function spreadsheetIdFrom(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  const fromUrl = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(trimmed);
  return fromUrl?.[1] ?? trimmed;
}

/** Authenticated Sheets REST call (fetch, no SDK: smaller supply chain). */
export async function sheetsFetch<T>(
  credentials: GoogleSheetsCredentials,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const account = parseServiceAccount(credentials.GOOGLE_SERVICE_ACCOUNT_JSON);
  const jwt = new JWT({ email: account.client_email, key: account.private_key, scopes: SCOPES });
  let token: string | null | undefined;
  try {
    token = (await jwt.getAccessToken()).token;
  } catch (error) {
    throw new SheetsError({
      message: `Google rejected the service account key: ${error instanceof Error ? error.message : String(error)}`,
      class: "auth",
    });
  }
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    const detail = body?.error?.message ?? `HTTP ${response.status}`;
    const hint =
      response.status === 403 || response.status === 404
        ? ` (share the Sheet with ${account.client_email} as Editor)`
        : "";
    throw new SheetsError({
      message: `Google Sheets: ${detail}${hint}`,
      class: response.status === 404 ? "validation" : classifyHttpStatus(response.status),
      retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
    });
  }
  return (await response.json()) as T;
}
