import "server-only";

import { createHmac } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { type Workflow, workflows, workflowVersions } from "@/lib/db/schema";
import { runWithTenant, type TenantContext, tdb } from "@/lib/db/tenant";
import type { Definition } from "@/lib/hive/definition";
import { type FormDefinition, formFromConfig } from "./schema";

export type PublicForm = {
  workflow: Workflow;
  form: FormDefinition;
  open: boolean;
  tenant: TenantContext;
};

type FormTarget = {
  workspace_id: string;
  user_id: string;
  enabled: boolean;
  published_version_id: string;
};

const ID_PATTERN = /^[a-z0-9]{10,40}$/;

/**
 * Resolve a public form by workflow id. form_target() (drizzle/0008) only
 * answers for workflows whose published version starts with a Form trigger;
 * everything after that runs inside the owning workspace's tenant context.
 */
export async function loadPublicForm(
  workflowId: string
): Promise<PublicForm | null> {
  if (!ID_PATTERN.test(workflowId)) {
    return null;
  }
  const rows = (await db.execute(
    sql`select workspace_id, user_id, enabled, published_version_id from form_target(${workflowId})`
  )) as unknown as FormTarget[];
  const target = rows[0];
  if (!target) {
    return null;
  }
  const tenant: TenantContext = {
    workspaceId: target.workspace_id,
    userId: target.user_id,
  };
  return runWithTenant(tenant, async () => {
    const result = await tdb(async (tx) => {
      const [workflow] = await tx
        .select()
        .from(workflows)
        .where(
          and(
            eq(workflows.id, workflowId),
            eq(workflows.workspaceId, tenant.workspaceId)
          )
        )
        .limit(1);
      const [version] = await tx
        .select({ definition: workflowVersions.definition })
        .from(workflowVersions)
        .where(
          and(
            eq(workflowVersions.id, target.published_version_id),
            eq(workflowVersions.workspaceId, tenant.workspaceId)
          )
        )
        .limit(1);
      return { workflow, version };
    });
    if (!(result.workflow && result.version)) {
      return null;
    }
    const definition = result.version.definition as Definition;
    const trigger = definition.nodes.find((n) => n.type === "trigger");
    if (!trigger) {
      return null;
    }
    return {
      workflow: result.workflow,
      form: formFromConfig(trigger.data.config),
      open: target.enabled,
      tenant,
    };
  });
}

/** HMAC of the client IP: rate limiting never keeps raw IPs. */
export function clientKey(headers: Headers): string {
  const ip =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "local";
  return createHmac(
    "sha256",
    process.env.BETTER_AUTH_SECRET ?? "flowledger-dev"
  )
    .update(ip)
    .digest("hex")
    .slice(0, 24);
}

const WINDOW_MS = 60_000;
const LIMIT = 10;
const globalForLimiter = globalThis as unknown as {
  formHits?: Map<string, { count: number; resetAt: number }>;
};

/** Fixed-window limiter per (client, form): 10 submissions a minute. */
export function allowSubmission(key: string): boolean {
  globalForLimiter.formHits ??= new Map();
  const hits = globalForLimiter.formHits;
  const now = Date.now();
  if (hits.size > 10_000) {
    for (const [k, v] of hits) {
      if (v.resetAt < now) {
        hits.delete(k);
      }
    }
  }
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= LIMIT;
}
