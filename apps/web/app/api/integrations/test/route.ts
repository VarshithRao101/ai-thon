import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/rbac";
import { getIntegration } from "@/lib/db/integrations";
import { runWithTenant } from "@/lib/db/tenant";
import { connectionTestFor } from "@/lib/integrations/connection-tests";
import { friendlyTestError } from "@/lib/integrations/friendly";
import { mergeSecrets } from "@/lib/integrations/secrets";
import { checkBodySize, checkOrigin, checkRate } from "@/lib/security/guard";
import type {
  IntegrationConfig,
  IntegrationType,
} from "@/lib/types/integration";
import {
  getCredentialMapping,
  getIntegration as getPluginFromRegistry,
} from "@/plugins";

export type TestConnectionRequest = {
  type: IntegrationType;
  config: IntegrationConfig;
};

export type TestConnectionResult = {
  status: "success" | "error";
  message: string;
};

/**
 * POST /api/integrations/test
 * Test connection credentials without saving
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validation guards plus the merge-with-stored path, kept linear
export async function POST(request: Request) {
  try {
    const blocked = checkOrigin(request) ?? checkBodySize(request);
    if (blocked) {
      return NextResponse.json(
        { error: blocked.message },
        { status: blocked.status }
      );
    }
    const ctx = await getRequestContext(request.headers);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const limited = checkRate(ctx.userId, "integrations.test");
    if (limited) {
      return NextResponse.json(
        { error: limited.message },
        { status: limited.status }
      );
    }
    // Testing raw credentials is part of creating a connection.
    if (!can(ctx.role, "integration:manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: TestConnectionRequest = await request.json();

    if (!(body.type && body.config)) {
      return NextResponse.json(
        { error: "Type and config are required" },
        { status: 400 }
      );
    }

    if (body.type === "database") {
      // Connecting to a user-supplied database URL is an SSRF vector; the
      // Database Query step is not offered in ZETA (docs/10).
      return NextResponse.json(
        { error: "Database connections are not supported" },
        { status: 400 }
      );
    }

    const plugin = getPluginFromRegistry(body.type);

    if (!plugin) {
      return NextResponse.json(
        { error: "Invalid integration type" },
        { status: 400 }
      );
    }

    const testFn = await connectionTestFor(plugin);

    if (!testFn) {
      return NextResponse.json(
        { error: "Integration does not support testing" },

        { status: 400 }
      );
    }

    // Testing an edit: fill in the fields the person didn't change.
    const integrationId = (body as { integrationId?: string }).integrationId;
    const stored = integrationId
      ? await runWithTenant(ctx, () => getIntegration(integrationId))
      : null;
    const config =
      stored && stored.type === body.type
        ? mergeSecrets(body.type, body.config, stored.config)
        : body.config;
    const credentials = getCredentialMapping(plugin, config);

    const testResult = await testFn(credentials);

    const result: TestConnectionResult = {
      status: testResult.success ? "success" : "error",
      message: testResult.success
        ? "Connection successful"
        : friendlyTestError(plugin.label, testResult.error || ""),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to test connection:", error);
    return NextResponse.json(
      {
        status: "error",
        message:
          error instanceof Error ? error.message : "Failed to test connection",
      },
      { status: 500 }
    );
  }
}
