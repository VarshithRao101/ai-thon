"use client";

import { Loader2, Rocket } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PublishState = { enabled: boolean; publishedVersionId: string | null };

type Props = {
  workflowId: string;
  /** Saves the canvas first, so the published version is what the user sees. */
  save: () => Promise<void>;
  disabled?: boolean;
};

/**
 * Publish (freeze a version) and the on/off switch for triggers (docs/02
 * "Enable/disable controls"). Manual test runs always use the draft.
 */
export function PublishControls({ workflowId, save, disabled }: Props) {
  const [state, setState] = useState<PublishState | null>(null);
  const [busy, setBusy] = useState<"publish" | "toggle" | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/workflows/${workflowId}`);
    if (response.ok) {
      const body = (await response.json()) as Partial<PublishState>;
      setState({
        enabled: Boolean(body.enabled),
        publishedVersionId: body.publishedVersionId ?? null,
      });
    }
  }, [workflowId]);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const publish = async () => {
    setBusy("publish");
    try {
      await save();
      const response = await fetch(`/api/workflows/${workflowId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enable: true }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        version?: number;
        error?: string;
        issues?: { message: string }[];
      };
      if (!response.ok) {
        const first = body.issues?.[0]?.message;
        toast.error(body.error ?? "Could not publish", { description: first });
        return;
      }
      toast.success(`Published v${body.version}. Triggers are live.`);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const toggle = async () => {
    if (!state?.publishedVersionId) {
      return;
    }
    setBusy("toggle");
    try {
      const enabled = !state.enabled;
      const response = await fetch(`/api/workflows/${workflowId}/enabled`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) {
        toast.error("Could not change the switch");
        return;
      }
      setState({ ...state, enabled });
      toast.success(enabled ? "Workflow on" : "Workflow paused");
    } finally {
      setBusy(null);
    }
  };

  const published = Boolean(state?.publishedVersionId);
  const live = published && state?.enabled;
  let stateLabel = "Draft";
  if (published) {
    stateLabel = live ? "Live" : "Paused";
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        aria-label={live ? "Turn workflow off" : "Turn workflow on"}
        aria-pressed={Boolean(live)}
        className={cn(
          "flex h-9 items-center gap-2 rounded-md border px-2.5 text-xs transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-60",
          live ? "border-primary/50 bg-primary/10" : "bg-secondary"
        )}
        disabled={!published || busy !== null || disabled}
        onClick={toggle}
        title={published ? "Turn on or off" : "Publish first"}
        type="button"
      >
        <span
          className={cn(
            "relative inline-flex h-4 w-7 rounded-full transition-colors",
            live ? "bg-primary" : "bg-muted-foreground/40"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-3 rounded-full bg-background transition-all",
              live ? "left-3.5" : "left-0.5"
            )}
          />
        </span>
        <span className="font-medium">{stateLabel}</span>
      </button>
      <Button
        className="h-9 gap-1.5 font-semibold"
        disabled={busy !== null || disabled}
        onClick={publish}
        size="sm"
        title="Publish"
      >
        {busy === "publish" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Rocket className="size-4" />
        )}
        Publish
      </Button>
    </div>
  );
}
