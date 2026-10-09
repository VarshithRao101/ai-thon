import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { recordAudit } from "@/lib/audit";
import { createIntegration, getIntegrations } from "@/lib/db/integrations";
import type {
  IntegrationConfig,
  IntegrationType,
} from "@/lib/types/integration";

export type GetIntegrationsResponse = {
  id: string;
  name: string;
  type: IntegrationType;
  isManaged?: boolean;
  status?: "ok" | "error" | "untested";
  lastTestedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  // Config is intentionally excluded for security
}[];

export type CreateIntegrationRequest = {
  name?: string;
  type: IntegrationType;
  config: IntegrationConfig;
};

export type CreateIntegrationResponse = {
  id: string;
  name: string;
  type: IntegrationType;
  createdAt: string;
  updatedAt: string;
};

/**
 * GET /api/integrations
 * Integrations in the active workspace (secrets are never returned here)
 */
export const GET = tenantRoute(
  "integrations.list",
  async (_ctx, request) => {
    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get("type") as IntegrationType | null;
    const integrations = await getIntegrations(typeFilter || undefined);

    const response: GetIntegrationsResponse = integrations.map(
      (integration) => ({
        id: integration.id,
        name: integration.name,
        type: integration.type,
        isManaged: integration.isManaged ?? false,
        status: integration.status,
        lastTestedAt: integration.lastTestedAt?.toISOString() ?? null,
        createdAt: integration.createdAt.toISOString(),
        updatedAt: integration.updatedAt.toISOString(),
      })
    );
    return NextResponse.json(response);
  },
  { permission: "integration:read" }
);

/**
 * POST /api/integrations
 * Create an integration; its config is sealed with the workspace data key
 */
export const POST = tenantRoute(
  "integrations.create",
  async (_ctx, request) => {
    const body: CreateIntegrationRequest = await request.json();
    if (!(body.type && body.config)) {
      throw new HttpError(400, "Type and config are required");
    }
    const integration = await createIntegration(
      body.name || "",
      body.type,
      body.config
    );
    await recordAudit(
      "integration.create",
      { type: "integration", id: integration.id },
      { integrationType: integration.type }
    );

    const response: CreateIntegrationResponse = {
      id: integration.id,
      name: integration.name,
      type: integration.type,
      createdAt: integration.createdAt.toISOString(),
      updatedAt: integration.updatedAt.toISOString(),
    };
    return NextResponse.json(response);
  },
  { permission: "integration:manage" }
);
