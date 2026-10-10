import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/rbac";
import { connectionTestFor } from "@/lib/integrations/connection-tests";
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
export async function POST(request: Request) {
  try {
    const ctx = await getRequestContext(request.headers);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      // Database Query step is not offered in FlowLedger (docs/10).
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

    const credentials = getCredentialMapping(plugin, body.config);

    const testResult = await testFn(credentials);

    const result: TestConnectionResult = {
      status: testResult.success ? "success" : "error",
      message: testResult.success
        ? "Connection successful"
        : testResult.error || "Connection failed",
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
