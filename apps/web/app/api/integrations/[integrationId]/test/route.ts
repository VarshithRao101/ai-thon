import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/rbac";
import {
  getIntegration as getIntegrationFromDb,
  markIntegrationTested,
} from "@/lib/db/integrations";
import { runWithTenant } from "@/lib/db/tenant";
import { connectionTestFor } from "@/lib/integrations/connection-tests";
import {
  getCredentialMapping,
  getIntegration as getPluginFromRegistry,
} from "@/plugins";

export type TestConnectionResult = {
  status: "success" | "error";
  message: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ integrationId: string }> }
) {
  try {
    const ctx = await getRequestContext(request.headers);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!can(ctx.role, "run:operate")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { integrationId } = await params;

    if (!integrationId) {
      return NextResponse.json(
        { error: "integrationId is required" },
        { status: 400 }
      );
    }

    return await runWithTenant(ctx, async () => {
      const integration = await getIntegrationFromDb(integrationId);

      if (!integration) {
        return NextResponse.json(
          { error: "Integration not found" },
          { status: 404 }
        );
      }

      if (integration.type === "database") {
        // SSRF vector (user-supplied URL); not supported in ZETA (docs/10).
        return NextResponse.json(
          { error: "Database connections are not supported" },
          { status: 400 }
        );
      }

      const plugin = getPluginFromRegistry(integration.type);

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

      const credentials = getCredentialMapping(plugin, integration.config);

      const testResult = await testFn(credentials);

      const result: TestConnectionResult = {
        status: testResult.success ? "success" : "error",
        message: testResult.success
          ? "Connection successful"
          : testResult.error || "Connection failed",
      };

      await markIntegrationTested(
        integrationId,
        testResult.success,
        result.message
      );
      return NextResponse.json(result);
    });
  } catch (error) {
    console.error("Failed to test connection:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to test connection",
      },
      { status: 500 }
    );
  }
}
