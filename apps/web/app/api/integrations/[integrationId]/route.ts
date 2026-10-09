import { NextResponse } from "next/server";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { recordAudit } from "@/lib/audit";
import {
  deleteIntegration,
  getIntegration,
  updateIntegration,
} from "@/lib/db/integrations";
import type { IntegrationConfig } from "@/lib/types/integration";

export type GetIntegrationResponse = {
  id: string;
  name: string;
  type: string;
  config: IntegrationConfig;
  createdAt: string;
  updatedAt: string;
};

export type UpdateIntegrationRequest = {
  name?: string;
  config?: IntegrationConfig;
};

type Params = { integrationId: string };

const notFound = () => new HttpError(404, "Integration not found");

function toResponse(integration: {
  id: string;
  name: string;
  type: string;
  config: IntegrationConfig;
  createdAt: Date;
  updatedAt: Date;
}): GetIntegrationResponse {
  return {
    id: integration.id,
    name: integration.name,
    type: integration.type,
    config: integration.config,
    createdAt: integration.createdAt.toISOString(),
    updatedAt: integration.updatedAt.toISOString(),
  };
}

/**
 * GET /api/integrations/[integrationId]
 * Decrypted config for editing: credential managers only
 */
export const GET = tenantRoute<Params>(
  "integrations.get",
  async (_ctx, _request, { integrationId }) => {
    const integration = await getIntegration(integrationId);
    if (!integration) {
      throw notFound();
    }
    return NextResponse.json(toResponse(integration));
  },
  { permission: "integration:manage" }
);

/**
 * PUT /api/integrations/[integrationId]
 */
export const PUT = tenantRoute<Params>(
  "integrations.update",
  async (_ctx, request, { integrationId }) => {
    const body: UpdateIntegrationRequest = await request.json();
    const integration = await updateIntegration(integrationId, body);
    if (!integration) {
      throw notFound();
    }
    await recordAudit(
      "integration.update",
      { type: "integration", id: integrationId },
      { credentialsChanged: body.config !== undefined }
    );
    return NextResponse.json(toResponse(integration));
  },
  { permission: "integration:manage" }
);

/**
 * DELETE /api/integrations/[integrationId]
 */
export const DELETE = tenantRoute<Params>(
  "integrations.delete",
  async (_ctx, _request, { integrationId }) => {
    const success = await deleteIntegration(integrationId);
    if (!success) {
      throw notFound();
    }
    await recordAudit("integration.delete", {
      type: "integration",
      id: integrationId,
    });
    return NextResponse.json({ success: true });
  },
  { permission: "integration:manage" }
);
