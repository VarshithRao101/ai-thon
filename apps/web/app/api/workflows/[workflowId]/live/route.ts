import { and, eq } from "drizzle-orm";
import { HttpError, tenantRoute } from "@/lib/api/route";
import { workflows } from "@/lib/db/schema";
import { tdb } from "@/lib/db/tenant";
import { type HiveEvent, subscribe } from "@/lib/hive/events";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

// GET /api/workflows/{id}/live: Server-Sent Events for every run of this
// workflow (form, webhook, schedule or test), so the canvas animates live.
export const GET = tenantRoute<{ workflowId: string }>(
  "workflows.live",
  async (ctx, request, { workflowId }) => {
    const [workflow] = await tdb((tx) =>
      tx
        .select({ id: workflows.id })
        .from(workflows)
        .where(
          and(
            eq(workflows.id, workflowId),
            eq(workflows.workspaceId, ctx.workspaceId)
          )
        )
        .limit(1)
    );
    if (!workflow) {
      throw new HttpError(404, "Workflow not found");
    }

    const encoder = new TextEncoder();
    let cleanup: () => void = () => undefined;
    const stream = new ReadableStream({
      async start(controller) {
        const send = (text: string) => {
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            cleanup();
          }
        };
        const unsubscribe = await subscribe(
          `ws:${ctx.workspaceId}`,
          (event: HiveEvent) => {
            if (event.workflowId === workflowId) {
              send(`data: ${JSON.stringify(event)}\n\n`);
            }
          }
        );
        const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
        cleanup = () => {
          clearInterval(heartbeat);
          unsubscribe();
        };
        request.signal.addEventListener("abort", () => {
          cleanup();
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
        send(": connected\n\n");
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  },
  { permission: "workflow:read" }
);
