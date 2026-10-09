import "server-only";

import { eq } from "drizzle-orm";
import { openForWorkspace, sealForWorkspace } from "@/lib/vault";
import type { IntegrationConfig, IntegrationType } from "../types/integration";
import { integrations, type NewIntegration } from "./schema";
import { requireTenant, tdb } from "./tenant";

/*
 * Credential vault data layer. Every function runs in the caller's tenant
 * context (lib/db/tenant.ts): Postgres RLS limits rows to the active workspace,
 * and configs are sealed with that workspace's data key (lib/vault).
 */

function sealConfig(
  workspaceId: string,
  config: Record<string, unknown>
): Promise<string> {
  return sealForWorkspace(workspaceId, JSON.stringify(config));
}

async function openConfig(
  workspaceId: string,
  sealed: string
): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await openForWorkspace(workspaceId, sealed));
  } catch (error) {
    // Never log the ciphertext or the error detail (may echo key material).
    console.error(
      "[vault] failed to open integration config:",
      error instanceof Error ? error.name : "unknown"
    );
    return {};
  }
}

export type DecryptedIntegration = {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  type: IntegrationType;
  config: IntegrationConfig;
  isManaged: boolean | null;
  status: "ok" | "error" | "untested";
  lastTestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type IntegrationRow = typeof integrations.$inferSelect;

async function decryptRow(row: IntegrationRow): Promise<DecryptedIntegration> {
  return {
    ...row,
    config: (await openConfig(
      row.workspaceId,
      row.config as string
    )) as IntegrationConfig,
  };
}

/** Integrations in the active workspace, optionally filtered by type. */
export async function getIntegrations(
  type?: IntegrationType
): Promise<DecryptedIntegration[]> {
  const rows = await tdb((tx) =>
    tx
      .select()
      .from(integrations)
      .where(type ? eq(integrations.type, type) : undefined)
  );
  return Promise.all(rows.map(decryptRow));
}

/** One integration in the active workspace (null if missing or another tenant's). */
export async function getIntegration(
  integrationId: string
): Promise<DecryptedIntegration | null> {
  const [row] = await tdb((tx) =>
    tx
      .select()
      .from(integrations)
      .where(eq(integrations.id, integrationId))
      .limit(1)
  );
  return row ? decryptRow(row) : null;
}

/** Used by workflow steps; tenant-scoped like everything else. */
export const getIntegrationById = getIntegration;

export async function createIntegration(
  name: string,
  type: IntegrationType,
  config: IntegrationConfig
): Promise<DecryptedIntegration> {
  const ctx = requireTenant();
  const sealed = await sealConfig(ctx.workspaceId, config);
  const [row] = await tdb((tx) =>
    tx
      .insert(integrations)
      .values({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId as string,
        name,
        type,
        config: sealed,
      })
      .returning()
  );
  return { ...(row as IntegrationRow), config };
}

export async function updateIntegration(
  integrationId: string,
  updates: { name?: string; config?: IntegrationConfig }
): Promise<DecryptedIntegration | null> {
  const ctx = requireTenant();
  const updateData: Partial<NewIntegration> = { updatedAt: new Date() };
  if (updates.name !== undefined) {
    updateData.name = updates.name;
  }
  if (updates.config !== undefined) {
    updateData.config = await sealConfig(ctx.workspaceId, updates.config);
    // New credentials have not been tested yet.
    updateData.status = "untested";
    updateData.lastError = null;
  }
  const [row] = await tdb((tx) =>
    tx
      .update(integrations)
      .set(updateData)
      .where(eq(integrations.id, integrationId))
      .returning()
  );
  return row ? decryptRow(row) : null;
}

export async function deleteIntegration(
  integrationId: string
): Promise<boolean> {
  const rows = await tdb((tx) =>
    tx
      .delete(integrations)
      .where(eq(integrations.id, integrationId))
      .returning({ id: integrations.id })
  );
  return rows.length > 0;
}

/** Record the outcome of a live connection test (shown in the vault UI). */
export async function markIntegrationTested(
  integrationId: string,
  ok: boolean,
  error?: string
): Promise<void> {
  await tdb((tx) =>
    tx
      .update(integrations)
      .set({
        status: ok ? "ok" : "error",
        lastTestedAt: new Date(),
        lastError: ok ? null : (error ?? "Connection failed").slice(0, 500),
      })
      .where(eq(integrations.id, integrationId))
  );
}

/*
 * Cross-tenant credential use is impossible by construction: steps fetch
 * credentials through getIntegrationById() under the run's tenant context, so
 * another workspace's integration id resolves to nothing (same as deleted).
 */
type WorkflowNodeForValidation = {
  data?: {
    config?: {
      integrationId?: string;
    };
  };
};

/**
 * Extract all integration IDs from workflow nodes
 */
export function extractIntegrationIds(
  nodes: WorkflowNodeForValidation[]
): string[] {
  const integrationIds: string[] = [];

  for (const node of nodes) {
    const integrationId = node.data?.config?.integrationId;
    if (integrationId && typeof integrationId === "string") {
      integrationIds.push(integrationId);
    }
  }

  return [...new Set(integrationIds)];
}
