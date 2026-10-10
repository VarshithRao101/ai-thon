import "server-only";

import type { IntegrationPlugin } from "@/plugins";

type TestFn = (
  credentials: Record<string, string>
) => Promise<{ success: boolean; error?: string }>;

/**
 * Connection tests that need Node-only code (SMTP sockets, Google auth, the AI
 * provider). They live here, not in the plugins' testConfig, because plugin
 * definitions are also bundled for the browser.
 */
const SERVER_TESTS: Record<string, () => Promise<TestFn>> = {
  ai: async () => (await import("@/plugins/ai/test")).testAi,
  "google-sheets": async () =>
    (await import("@/plugins/google-sheets/test")).testGoogleSheets,
  "smtp-email": async () =>
    (await import("@/plugins/smtp-email/test")).testSmtpEmail,
};

/** The connection test for a plugin, or null when it has none. */
export async function connectionTestFor(
  plugin: IntegrationPlugin
): Promise<TestFn | null> {
  const server = SERVER_TESTS[plugin.type];
  if (server) {
    return await server();
  }
  return plugin.testConfig ? await plugin.testConfig.getTestFunction() : null;
}
