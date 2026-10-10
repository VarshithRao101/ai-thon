"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  nodesAtom,
  selectedExecutionIdAtom,
  updateNodeDataAtom,
} from "@/lib/workflow-store";

type LiveEvent = {
  executionId: string;
  kind: "run" | "step";
  status: string;
  nodeId?: string;
};

type CanvasStatus = "idle" | "running" | "success" | "error";

const STEP_STATUS: Record<string, CanvasStatus> = {
  running: "running",
  waiting: "running",
  success: "success",
  error: "error",
  skipped: "idle",
};

const FINAL = new Set(["success", "error", "cancelled"]);

type Actions = {
  current: { current: string | null };
  nodeIds: { current: string[] };
  setStatus: (id: string, status: CanvasStatus) => void;
  select: (executionId: string) => void;
};

function notifyFinished(executionId: string, status: string) {
  if (status === "success") {
    toast.success("Run finished", {
      action: {
        label: "Verify",
        onClick: () =>
          window.open(`/verify/${executionId}`, "_blank", "noopener"),
      },
    });
  } else if (status === "error") {
    toast.error("Run failed: open Runs and ask the Doctor");
  }
}

/** Apply one live event to the canvas. */
function applyEvent(event: LiveEvent, actions: Actions) {
  const isNewRun =
    event.kind === "run" &&
    event.status === "running" &&
    actions.current.current !== event.executionId;
  if (isNewRun) {
    // A new run: clear the canvas, then follow it.
    actions.current.current = event.executionId;
    actions.select(event.executionId);
    for (const id of actions.nodeIds.current) {
      actions.setStatus(id, "idle");
    }
  }
  if (event.executionId !== actions.current.current) {
    return;
  }
  if (event.kind === "step" && event.nodeId) {
    actions.setStatus(event.nodeId, STEP_STATUS[event.status] ?? "idle");
  }
  if (event.kind === "run" && FINAL.has(event.status)) {
    notifyFinished(event.executionId, event.status);
  }
}

/**
 * Follow every run of this workflow over SSE and light up the canvas node by
 * node, whether the run came from a test, a phone submitting the form, a
 * webhook or a schedule.
 */
export function useLiveRuns(workflowId: string | null) {
  const nodes = useAtomValue(nodesAtom);
  const updateNodeData = useSetAtom(updateNodeDataAtom);
  const setSelectedExecutionId = useSetAtom(selectedExecutionIdAtom);
  const nodeIds = useRef<string[]>([]);
  const current = useRef<string | null>(null);
  nodeIds.current = nodes.map((n) => n.id);

  useEffect(() => {
    if (!workflowId) {
      return;
    }
    const actions: Actions = {
      current,
      nodeIds,
      setStatus: (id, status) => updateNodeData({ id, data: { status } }),
      select: setSelectedExecutionId,
    };
    const source = new EventSource(`/api/workflows/${workflowId}/live`);
    source.onmessage = (message) => {
      try {
        applyEvent(JSON.parse(message.data) as LiveEvent, actions);
      } catch {
        // ignore malformed events
      }
    };
    return () => source.close();
  }, [workflowId, updateNodeData, setSelectedExecutionId]);
}
