import type { IntegrationPlugin } from "../registry";
import { registerIntegration } from "../registry";
import { GoogleSheetsIcon } from "./icon";

const googleSheetsPlugin: IntegrationPlugin = {
  type: "google-sheets",
  label: "Google Sheets",
  description: "Add rows to a Google Sheet",
  icon: GoogleSheetsIcon,
  formFields: [
    {
      id: "serviceAccountJson",
      label: "Service account key (JSON)",
      type: "password",
      placeholder: '{"type":"service_account", ...}',
      configKey: "serviceAccountJson",
      envVar: "GOOGLE_SERVICE_ACCOUNT_JSON",
      helpText: "Paste the whole JSON key file. Create one in ",
      helpLink: {
        text: "Google Cloud → Service Accounts",
        url: "https://console.cloud.google.com/iam-admin/serviceaccounts",
      },
    },
    {
      id: "spreadsheetId",
      label: "Default spreadsheet (id or URL)",
      type: "text",
      placeholder: "https://docs.google.com/spreadsheets/d/…",
      configKey: "spreadsheetId",
      envVar: "GOOGLE_SHEETS_SPREADSHEET_ID",
      helpText: "Share the Sheet with the service account's email as Editor",
    },
  ],
  // Connection test: lib/integrations/connection-tests.ts (server-only code).
  actions: [
    {
      slug: "append-row",
      label: "Add Row to Sheet",
      description: "Append one row; each line of the value list fills the next column",
      category: "Google Sheets",
      stepFunction: "appendRowStep",
      stepImportPath: "append-row",
      outputFields: [
        { field: "rowNumber", description: "Row number written" },
        { field: "range", description: "A1 range written" },
      ],
      configFields: [
        {
          key: "rowValues",
          label: "Row values (one per line, in column order)",
          type: "template-textarea",
          placeholder: "{{Form.submittedAt}}\n{{Form.name}}\n{{Form.email}}",
          example: "{{@trigger:Form.submittedAt}}\n{{@trigger:Form.name}}\n{{@trigger:Form.email}}",
          rows: 7,
          required: true,
        },
        {
          key: "sheetName",
          label: "Tab name (optional)",
          type: "text",
          placeholder: "Sheet1",
        },
        {
          key: "spreadsheetId",
          label: "Spreadsheet (optional)",
          type: "template-input",
          placeholder: "Uses the connection's default spreadsheet",
        },
      ],
    },
  ],
};

registerIntegration(googleSheetsPlugin);
export default googleSheetsPlugin;
