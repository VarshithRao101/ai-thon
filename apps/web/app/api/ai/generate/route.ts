import { validateGraph } from "@flowledger/engine";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { planWorkflow, summarizeCanvas } from "@/lib/ai/copilot";
import { buildWorkflow } from "@/lib/ai/plan";
import { pluginCatalog } from "@/lib/ai/plugin-catalog";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { consumeAiMessage } from "@/lib/billing/usage";
import { integrations } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";
import {
  normalizeDefinition,
  referencesOf,
  toEngineGraph,
} from "@/lib/hive/definition";

const MAX_PROMPT = 2000;
const STEP_DELAY_MS = 140;

type ExistingWorkflow = {
  name?: string;
  nodes?: {
    id: string;
    data?: { label?: string; type?: string; config?: Record<string, unknown> };
  }[];
  edges?: unknown[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST /api/ai/generate: the Copilot (docs/09). Plain English → a validated
 * workflow. Streams NDJSON operations so nodes drop onto the canvas one by
 * one; `mode: "json"` returns the whole workflow at once.
 */
export const POST = tenantRoute(
  "ai.generate",
  async (ctx, request) => {
    const body = (await request.json().catch(() => ({}))) as {
      prompt?: unknown;
      existingWorkflow?: ExistingWorkflow;
      mode?: string;
    };
    const prompt =
      typeof body.prompt === "string"
        ? body.prompt.trim().slice(0, MAX_PROMPT)
        : "";
    if (!prompt) {
      throw new HttpError(400, "Describe the automation you want");
    }
    // Credits: AI messages per plan per month (D-056).
    await consumeAiMessage();
    const existing = body.existingWorkflow?.nodes?.length
      ? body.existingWorkflow
      : undefined;

    // Attach the workspace's saved connections so the result can run right away.
    const saved = await tdb((tx) =>
      tx
        .select({ id: integrations.id, type: integrations.type })
        .from(integrations)
        .where(eq(integrations.workspaceId, ctx.workspaceId))
    );
    const connections: Record<string, string> = {};
    for (const row of saved) {
      connections[row.type] ??= row.id;
    }

    // Other apps: the ones connected, plus any the request names.
    const extra = pluginCatalog(
      Object.keys(connections),
      `${prompt}\n${existing ? summarizeCanvas(existing.nodes ?? []) : ""}`
    );
    const result = await planWorkflow(
      prompt,
      existing
        ? {
            name: existing.name,
            summary: summarizeCanvas(existing.nodes ?? []),
          }
        : undefined,
      extra
    );
    const built = buildWorkflow(result.plan, connections, extra);
    const definition = normalizeDefinition(built.nodes, built.edges);
    const issues = validateGraph(
      toEngineGraph(definition),
      referencesOf(definition)
    );
    const notes = [...built.notes, ...issues.map((i) => i.message)];
    const meta = {
      source: result.source,
      model: result.model ?? null,
      notes,
      ...(result.source === "template"
        ? { fallbackReason: result.reason ?? null }
        : {}),
    };

    if (body.mode === "json") {
      return NextResponse.json({
        name: built.name,
        description: built.description,
        nodes: built.nodes,
        edges: built.edges,
        ...meta,
      });
    }

    const encoder = new TextEncoder();
    const send = (
      controller: ReadableStreamDefaultController,
      message: object
    ) => controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for (const node of existing?.nodes ?? []) {
            send(controller, {
              type: "operation",
              operation: { op: "removeNode", nodeId: node.id },
            });
          }
          send(controller, {
            type: "operation",
            operation: { op: "setName", name: built.name },
          });
          send(controller, {
            type: "operation",
            operation: { op: "setDescription", description: built.description },
          });
          for (const node of built.nodes) {
            send(controller, {
              type: "operation",
              operation: { op: "addNode", node },
            });
            await sleep(STEP_DELAY_MS);
          }
          for (const edge of built.edges) {
            send(controller, {
              type: "operation",
              operation: { op: "addEdge", edge },
            });
            await sleep(STEP_DELAY_MS / 2);
          }
          send(controller, { type: "complete", ...meta });
        } catch (error) {
          send(controller, {
            type: "error",
            error:
              error instanceof Error
                ? error.message
                : "Failed to generate the workflow",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
      },
    });
  },
  { permission: "workflow:write" }
);
