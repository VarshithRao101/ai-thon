"use client";

import { Crown, Sparkles, Workflow } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Meter = { used: number; limit: number | null };
type Usage = {
  plan: { id: string; name: string; price: string };
  workflows: Meter;
  aiMessages: Meter & { resetsAt: string };
  plans: {
    id: string;
    name: string;
    price: string;
    workflows: number | null;
    aiMessages: number | null;
  }[];
};

function Bar({
  label,
  icon: Icon,
  meter,
  hint,
}: {
  label: string;
  icon: typeof Workflow;
  meter: Meter;
  hint?: string;
}) {
  const pct = meter.limit ? Math.min(100, (meter.used / meter.limit) * 100) : 8;
  let tone = "from-[#ffd34d] to-[#ff9f1c]";
  if (pct >= 100) {
    tone = "from-red-400 to-red-500";
  } else if (pct >= 80) {
    tone = "from-amber-300 to-orange-400";
  }
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-white/70">
          <Icon className="size-3.5 text-[#ffc326]" /> {label}
        </span>
        <span className="font-medium tabular-nums">
          {meter.used}
          <span className="text-white/40"> / {meter.limit ?? "∞"}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <motion.div
          animate={{ width: `${pct}%` }}
          className={cn("h-full rounded-full bg-gradient-to-r", tone)}
          initial={{ width: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      {hint && <p className="mt-1 text-[11px] text-white/35">{hint}</p>}
    </div>
  );
}

/** Plan and credits (D-056): workflows kept and AI messages this month. */
export function PlanCard({ refreshKey }: { refreshKey?: unknown }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch when the dashboard reloads its data
  useEffect(() => {
    fetch("/api/usage", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setUsage)
      .catch(() => undefined);
  }, [refreshKey]);

  if (!usage) {
    return <div className="nf-card h-44 animate-pulse rounded-2xl" />;
  }
  const resets = new Date(usage.aiMessages.resetsAt).toLocaleDateString(
    "en-IN",
    { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }
  );
  return (
    <section className="nf-card relative overflow-hidden rounded-2xl p-5">
      <div className="nf-orb nf-orb-a opacity-40" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/45 text-xs uppercase tracking-wider">
              Your plan
            </p>
            <p className="mt-0.5 flex items-center gap-2 font-display font-semibold text-xl">
              {usage.plan.name}
              <span className="rounded-full bg-[#ffc326]/15 px-2 py-0.5 font-medium font-sans text-[#ffe08a] text-[11px]">
                {usage.plan.id === "free"
                  ? "Free trial"
                  : `${usage.plan.price}/mo`}
              </span>
            </p>
          </div>
          <Crown className="size-5 text-[#ffc326]/80" />
        </div>
        <div className="mt-4 space-y-3.5">
          <Bar icon={Workflow} label="Workflows" meter={usage.workflows} />
          <Bar
            hint={`Resets on ${resets}`}
            icon={Sparkles}
            label="AI messages this month"
            meter={usage.aiMessages}
          />
        </div>
        {usage.plan.id !== "business" && (
          <button
            className="nf-gold-btn mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 font-semibold text-sm"
            onClick={() =>
              toast.info(
                "Paid plans are coming soon. Everyone gets the Starter allowance free during the preview."
              )
            }
            type="button"
          >
            Upgrade plan
          </button>
        )}
      </div>
    </section>
  );
}
