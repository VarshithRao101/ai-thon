"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { Loader2, PlugZap, RotateCcw, Stethoscope, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfigureConnectionOverlay } from "@/components/overlays/add-connection-overlay";
import { useOverlay } from "@/components/overlays/overlay-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import { integrationsVersionAtom } from "@/lib/integrations-store";
import type { IntegrationType } from "@/lib/types/integration";
import {
  currentWorkflowIdAtom,
  edgesAtom,
  nodesAtom,
  triggerExecuteAtom,
} from "@/lib/workflow-store";

type Diagnosis = {
  stepLabel: string;
  cause: string;
  suggestion: string;
  fix: { nodeId: string; key: string; value: string; label: string } | null;
  reconnect: string | null;
  retryable: boolean;
  source: "ai" | "rules";
  model?: string;
};

/** "Ask Run Doctor" for a failed run (docs/09): diagnosis + one-click fix. */
export function RunDoctor({
  executionId,
  onRetry,
}: {
  executionId: string;
  onRetry: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const workflowId = useAtomValue(currentWorkflowIdAtom);
  const nodes = useAtomValue(nodesAtom);
  const edges = useAtomValue(edgesAtom);
  const setNodes = useSetAtom(nodesAtom);
  const setTriggerExecute = useSetAtom(triggerExecuteAtom);
  const setIntegrationsVersion = useSetAtom(integrationsVersionAtom);
  const { push } = useOverlay();

  /** Open the connection dialog; attach the new connection to every step that needs it. */
  const reconnect = (type: string) => {
    setOpen(false);
    push(ConfigureConnectionOverlay, {
      type: type as IntegrationType,
      onSuccess: async (integrationId: string) => {
        setIntegrationsVersion((v) => v + 1);
        if (!workflowId) {
          return;
        }
        const updated = nodes.map((node) => {
          const actionType = String(node.data.config?.actionType ?? "");
          return actionType.startsWith(`${type}/`)
            ? {
                ...node,
                data: {
                  ...node.data,
                  config: { ...node.data.config, integrationId },
                },
              }
            : node;
        });
        setNodes(updated);
        await api.workflow.update(workflowId, { nodes: updated, edges });
        toast.success(
          "Connected. Run a test, or publish again for live triggers."
        );
      },
    });
  };

  const ask = async () => {
    setOpen(true);
    setLoading(true);
    setDiagnosis(null);
    try {
      const response = await fetch("/api/ai/doctor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executionId }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Run Doctor is unavailable");
      }
      setDiagnosis(body as Diagnosis);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Run Doctor failed");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const applyFix = async () => {
    const fix = diagnosis?.fix;
    if (!(fix && workflowId)) {
      return;
    }
    setApplying(true);
    try {
      const updated = nodes.map((node) =>
        node.id === fix.nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                config: { ...node.data.config, [fix.key]: fix.value },
              },
            }
          : node
      );
      setNodes(updated);
      await api.workflow.update(workflowId, { nodes: updated, edges });
      toast.success("Fix applied. Running a test…");
      setOpen(false);
      setTriggerExecute(true);
    } catch {
      toast.error("Could not apply the fix");
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <button
        className="flex items-center gap-1 rounded px-1.5 py-1 text-amber-500 text-xs transition-colors hover:bg-amber-500/10"
        onClick={ask}
        title="Explain why this run failed and suggest a fix"
        type="button"
      >
        <Stethoscope className="size-3.5" />
        Doctor
      </button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <Stethoscope className="size-5 text-amber-500" />
              Run Doctor
            </DialogTitle>
            <DialogDescription>
              {diagnosis
                ? `Step: ${diagnosis.stepLabel}`
                : "Reading the failed step…"}
            </DialogDescription>
          </DialogHeader>
          {loading && (
            <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" />
              Diagnosing
            </div>
          )}
          {diagnosis && (
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  What went wrong
                </p>
                <p className="mt-1">{diagnosis.cause}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  What to do
                </p>
                <p className="mt-1">{diagnosis.suggestion}</p>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {diagnosis.fix && (
                  <Button disabled={applying} onClick={applyFix}>
                    {applying ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Wand2 className="size-4" />
                    )}
                    Apply fix & test ({diagnosis.fix.label})
                  </Button>
                )}
                {diagnosis.retryable && (
                  <Button
                    onClick={async () => {
                      setOpen(false);
                      await onRetry();
                    }}
                    variant="outline"
                  >
                    <RotateCcw className="size-4" />
                    Retry run
                  </Button>
                )}
                {diagnosis.reconnect && (
                  <Button
                    onClick={() => reconnect(diagnosis.reconnect as string)}
                    variant="outline"
                  >
                    <PlugZap className="size-4" />
                    Connect now
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {diagnosis.source === "ai"
                  ? `Explained by AI (${diagnosis.model}). Fixes are checked before they are offered.`
                  : "Diagnosed by N-Flow's built-in rules."}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
