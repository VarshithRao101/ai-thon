"use client";

import { ArrowRight, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { BeeMark } from "@/components/brand/brand-lockup";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";

type Template = {
  slug: string;
  title: string;
  summary: string;
  trigger: string;
  steps: number;
};

// Short chip labels; clicking fills the full prompt.
const EXAMPLES = [
  {
    label: "Hackathon sign-ups",
    prompt:
      "When someone registers for our hackathon, pick their track with AI, save them to a Google Sheet, email them a personal confirmation and alert our team on Telegram",
  },
  {
    label: "Hot leads to Telegram",
    prompt:
      "Score every new sales lead with AI and ping Telegram when it's hot",
  },
  {
    label: "Clinic bookings",
    prompt:
      "When a patient books at my clinic, add it to a sheet, confirm by email and send a reminder later",
  },
  {
    label: "Daily 9 AM update",
    prompt:
      "Every morning at 9, post a short AI-written update to our Telegram group",
  },
];

type Props = {
  ensureSession: () => Promise<void>;
  onStartBlank: () => void;
  onLeaving: () => void;
};

/**
 * Copilot-first home (docs/12): describe an automation in plain English, or
 * start from a template. Either way the user lands on a ready canvas.
 */
export function CopilotHome({ ensureSession, onStartBlank, onLeaving }: Props) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);

  // A prompt typed on the landing page or dashboard arrives as ?prompt=.
  useEffect(() => {
    const incoming = new URLSearchParams(window.location.search).get("prompt");
    if (incoming) {
      setPrompt(incoming.slice(0, 1000));
    }
  }, []);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : []))
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

  const build = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = prompt.trim();
    if (!text || busy) {
      return;
    }
    setBusy("prompt");
    try {
      await ensureSession();
      const workflow = await api.workflow.create({
        name: "AI Generated Workflow",
        description: "",
        nodes: [],
        edges: [],
      });
      sessionStorage.setItem("ai-prompt", text);
      sessionStorage.setItem("generating-workflow-id", workflow.id);
      sessionStorage.setItem("animate-sidebar", "true");
      onLeaving();
      router.replace(`/workflows/${workflow.id}?generating=true`);
    } catch (error) {
      console.error("[home] could not start the Copilot:", error);
      toast.error("Could not start the Copilot. Please try again.");
      setBusy(null);
    }
  };

  const openTemplate = async (slug: string) => {
    if (busy) {
      return;
    }
    setBusy(slug);
    try {
      await ensureSession();
      const response = await fetch(`/api/templates/${slug}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const built = (await response.json()) as {
        name: string;
        description: string;
        nodes: Parameters<typeof api.workflow.create>[0]["nodes"];
        edges: Parameters<typeof api.workflow.create>[0]["edges"];
      };
      const workflow = await api.workflow.create({
        name: built.name,
        description: built.description,
        nodes: built.nodes,
        edges: built.edges,
      });
      sessionStorage.setItem("animate-sidebar", "true");
      onLeaving();
      router.replace(`/workflows/${workflow.id}`);
    } catch (error) {
      console.error("[home] template failed:", error);
      toast.error("Could not open that template");
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-dvh w-full items-center justify-center px-4 pt-20 pb-16">
      {/* Only the panel takes clicks, so the toolbar (sign in, workflows) stays usable. */}
      <div className="pointer-events-auto w-full max-w-2xl rounded-3xl bg-background/80 p-2 backdrop-blur-sm sm:p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.16em]">
          <BeeMark className="size-6" />
          N-Flow by TRNT BEE
        </div>
        <h1 className="mt-4 font-display font-semibold text-3xl leading-tight tracking-tight sm:text-4xl">
          What should we <span className="text-brand-gradient">automate</span>?
        </h1>

        <form className="mt-6" onSubmit={build}>
          <div className="honeycomb-glow rounded-2xl border bg-card p-2 shadow-sm focus-within:border-primary/60">
            <Textarea
              aria-label="Describe your automation"
              className="min-h-24 resize-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
              disabled={busy !== null}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  build().catch(() => undefined);
                }
              }}
              placeholder="e.g. When my form is filled, add it to a sheet and alert Telegram"
              value={prompt}
            />
            <div className="flex items-center justify-between gap-2 px-2 pb-1">
              <span className="hidden text-muted-foreground text-xs sm:inline">
                Ctrl + Enter to build
              </span>
              <Button
                className="ml-auto h-10 gap-2 font-semibold"
                disabled={!prompt.trim() || busy !== null}
                type="submit"
              >
                {busy === "prompt" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Build with AI
              </Button>
            </div>
          </div>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              className="rounded-full border bg-secondary/60 px-3 py-1.5 text-left text-muted-foreground text-xs transition-colors hover:border-primary/50 hover:text-foreground"
              disabled={busy !== null}
              key={example.label}
              onClick={() => setPrompt(example.prompt)}
              title={example.prompt}
              type="button"
            >
              {example.label}
            </button>
          ))}
        </div>

        {templates.length > 0 && (
          <section className="mt-10">
            <h2 className="font-medium text-muted-foreground text-sm">
              Templates
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {templates.map((t) => (
                <button
                  className="group rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 disabled:opacity-60"
                  disabled={busy !== null}
                  key={t.slug}
                  onClick={() => openTemplate(t.slug)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{t.title}</span>
                    {busy === t.slug ? (
                      <Loader2 className="size-4 animate-spin text-primary" />
                    ) : (
                      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    )}
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground/80 uppercase tracking-wider">
                    {t.trigger} · {t.steps} steps
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-muted-foreground text-xs">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-primary" />
            Personal data is hidden from the AI
          </span>
          <button
            className="underline-offset-4 hover:text-foreground hover:underline"
            disabled={busy !== null}
            onClick={onStartBlank}
            type="button"
          >
            Blank canvas
          </button>
        </div>
      </div>
    </div>
  );
}
