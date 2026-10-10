"use client";

import { animate, stagger, utils } from "animejs";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Clock,
  FileSpreadsheet,
  Fingerprint,
  KeyRound,
  LogOut,
  Mail,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { BeeMark } from "@/components/brand/brand-lockup";
import { IntegrationsOverlay } from "@/components/overlays/integrations-overlay";
import { useOverlay } from "@/components/overlays/overlay-provider";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type DashWorkflow = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  published: boolean;
  trigger: string;
  steps: number;
  runs: number;
  lastRunAt: string | null;
  lastStatus: string | null;
  updatedAt: string;
};
type DashRun = {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  trigger: string | null;
  startedAt: string;
  duration: string | null;
  error: string | null;
  receiptStatus: string | null;
};
type DashData = {
  workflows: DashWorkflow[];
  recentRuns: DashRun[];
  stats: {
    runs7d: number;
    succeeded7d: number;
    failed7d: number;
    anchored: number;
  };
  connections: string[];
};

const APPS = [
  {
    type: "smtp-email",
    label: "Gmail",
    hint: "Send email from your address",
    icon: Mail,
  },
  {
    type: "google-sheets",
    label: "Google Sheets",
    hint: "Your service account + sheet",
    icon: FileSpreadsheet,
  },
  {
    type: "telegram",
    label: "Telegram",
    hint: "Your bot token + chat",
    icon: Send,
  },
];

const FILTERS = ["All", "Active", "Paused", "Drafts"] as const;

const RUN_DOT: Record<string, string> = {
  success: "bg-emerald-400",
  error: "bg-red-400",
};

function workflowState(w: { published: boolean; enabled: boolean }): string {
  if (!w.published) {
    return "Draft";
  }
  return w.enabled ? "Active" : "Paused";
}

function timeAgo(iso: string | null): string {
  if (!iso) {
    return "never";
  }
  const s = Math.max(
    1,
    Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  );
  if (s < 60) {
    return `${s}s ago`;
  }
  const m = Math.round(s / 60);
  if (m < 60) {
    return `${m}m ago`;
  }
  const h = Math.round(m / 60);
  if (h < 48) {
    return `${h}h ago`;
  }
  return `${Math.round(h / 24)}d ago`;
}

function greeting(): string {
  const h = Number(
    new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Kolkata",
    }).format(new Date())
  );
  if (h < 12) {
    return "Good morning";
  }
  if (h < 17) {
    return "Good afternoon";
  }
  return "Good evening";
}

function StatusPill({ status }: { status: string | null }) {
  const map: Record<string, { label: string; cls: string; icon: ReactNode }> = {
    success: {
      label: "Succeeded",
      cls: "text-emerald-300 bg-emerald-500/10 border-emerald-400/30",
      icon: <CheckCircle2 className="size-3.5" />,
    },
    error: {
      label: "Failed",
      cls: "text-red-300 bg-red-500/10 border-red-400/30",
      icon: <XCircle className="size-3.5" />,
    },
    running: {
      label: "Running",
      cls: "text-amber-200 bg-amber-500/10 border-amber-400/30",
      icon: <Activity className="size-3.5 animate-pulse" />,
    },
    queued: {
      label: "Queued",
      cls: "text-amber-200 bg-amber-500/10 border-amber-400/30",
      icon: <Clock className="size-3.5" />,
    },
    waiting: {
      label: "Waiting",
      cls: "text-sky-200 bg-sky-500/10 border-sky-400/30",
      icon: <Clock className="size-3.5" />,
    },
    skipped: {
      label: "Skipped",
      cls: "text-white/60 bg-white/5 border-white/15",
      icon: <CircleDashed className="size-3.5" />,
    },
  };
  const item = status ? map[status] : undefined;
  if (!item) {
    return <span className="text-white/35 text-xs">No runs yet</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-[11px]",
        item.cls
      )}
    >
      {item.icon}
      {item.label}
    </span>
  );
}

function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const state = { n: 0 };
    animate(state, {
      n: value,
      duration: 1200,
      ease: "outExpo",
      modifier: utils.round(0),
      onUpdate: () => {
        el.textContent = state.n.toLocaleString("en-IN");
      },
    });
  }, [value]);
  return <span ref={ref}>0</span>;
}

function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-checked={on}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-40",
        on ? "border-[#ffc326]/60 bg-[#ffc326]" : "border-white/15 bg-white/10"
      )}
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onChange();
      }}
      role="switch"
      type="button"
    >
      <motion.span
        animate={{ x: on ? 20 : 2 }}
        className={cn(
          "absolute top-0.5 left-0 size-[18px] rounded-full shadow",
          on ? "bg-[#0a0a0a]" : "bg-white"
        )}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
      />
    </button>
  );
}

export function Dashboard() {
  const router = useRouter();
  const { data: session } = useSession();
  const { open } = useOverlay();
  const [data, setData] = useState<DashData | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busyToggle, setBusyToggle] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/dashboard", { cache: "no-store" });
    if (res.ok) {
      setData((await res.json()) as DashData);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
    const timer = setInterval(() => load().catch(() => undefined), 8000);
    return () => clearInterval(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const list = data?.workflows ?? [];
    return list.filter((w) => {
      if (query && !w.name.toLowerCase().includes(query.toLowerCase())) {
        return false;
      }
      if (filter === "Active") {
        return w.enabled && w.published;
      }
      if (filter === "Paused") {
        return w.published && !w.enabled;
      }
      if (filter === "Drafts") {
        return !w.published;
      }
      return true;
    });
  }, [data, filter, query]);

  const loaded = data !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run the entrance animation when the filter changes
  useEffect(() => {
    if (!(loaded && gridRef.current)) {
      return;
    }
    animate(gridRef.current.querySelectorAll("[data-card]"), {
      opacity: [0, 1],
      translateY: [18, 0],
      delay: stagger(50),
      duration: 600,
      ease: "outExpo",
    });
  }, [loaded, filter]);

  const toggle = async (w: DashWorkflow) => {
    if (!w.published) {
      toast.info("Publish this workflow from the builder first.");
      return;
    }
    setBusyToggle(w.id);
    const res = await fetch(`/api/workflows/${w.id}/enabled`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !w.enabled }),
    });
    setBusyToggle(null);
    if (!res.ok) {
      toast.error("Couldn't change that workflow.");
      return;
    }
    toast.success(w.enabled ? `Paused "${w.name}"` : `"${w.name}" is live`);
    load().catch(() => undefined);
  };

  const create = (event?: FormEvent) => {
    event?.preventDefault();
    const text = prompt.trim();
    router.push(text ? `/build?prompt=${encodeURIComponent(text)}` : "/build");
  };

  const logout = async () => {
    await signOut();
    router.replace("/");
  };

  const user = session?.user;
  const first = (user?.name ?? "").split(" ")[0] || "there";
  const workflows = data?.workflows ?? [];
  const active = workflows.filter((w) => w.enabled && w.published).length;
  const connected = new Set(data?.connections ?? []);
  const checklist = [
    { done: connected.size > 0, label: "Connect one of your apps" },
    { done: workflows.length > 0, label: "Create a workflow" },
    { done: workflows.some((w) => w.published), label: "Publish it" },
    {
      done: (data?.stats.anchored ?? 0) > 0,
      label: "Get your first on-chain receipt",
    },
  ];
  const progress = checklist.filter((c) => c.done).length;

  return (
    <div className="nf-landing pointer-events-auto relative min-h-dvh bg-[#0a0a0a] text-white">
      <div className="nf-hero-bg pointer-events-none fixed inset-0 opacity-70" />

      {/* Top bar */}
      <header className="sticky top-0 z-40 border-white/[0.06] border-b bg-[#0a0a0a]/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link className="flex items-center gap-2" href="/dashboard">
            <BeeMark className="size-7" />
            <span className="font-display font-semibold tracking-tight">
              N-<span className="text-[#ffc326]">Flow</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 text-sm md:flex">
            <span className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-white">
              Dashboard
            </span>
            <Link
              className="rounded-lg px-3 py-1.5 text-white/60 hover:bg-white/[0.04] hover:text-white"
              href="/build"
            >
              Builder
            </Link>
            <button
              className="rounded-lg px-3 py-1.5 text-white/60 hover:bg-white/[0.04] hover:text-white"
              onClick={() => open(IntegrationsOverlay, {})}
              type="button"
            >
              Connections
            </button>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              className="nf-gold-btn hidden items-center gap-1.5 rounded-xl px-3.5 py-2 font-semibold text-sm sm:inline-flex"
              href="/build"
            >
              <Plus className="size-4" /> New workflow
            </Link>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-1 pr-1 pl-1">
              {user?.image ? (
                // biome-ignore lint/performance/noImgElement: Google avatars come from many hosts
                <img
                  alt=""
                  className="size-7 rounded-lg"
                  height={28}
                  referrerPolicy="no-referrer"
                  src={user.image}
                  width={28}
                />
              ) : (
                <span className="grid size-7 place-items-center rounded-lg bg-[#ffc326] font-bold text-[#0a0a0a] text-xs">
                  {first.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="hidden max-w-[160px] truncate text-sm text-white/75 lg:block">
                {user?.email}
              </span>
              <button
                aria-label="Log out"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-white/60 transition hover:bg-red-500/10 hover:text-red-200"
                onClick={logout}
                type="button"
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Log out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        {/* Greeting + composer */}
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          className="nf-card relative overflow-hidden rounded-3xl p-6 sm:p-9"
          initial={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="nf-orb nf-orb-a opacity-60" />
          <div className="relative grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
            <div>
              <p className="text-sm text-white/50">
                {greeting()}, {first}
              </p>
              <h1 className="mt-2 font-display font-semibold text-3xl tracking-tight sm:text-4xl">
                What should we <span className="nf-gold-char">automate</span>{" "}
                next?
              </h1>
              <form
                className="nf-prompt mt-6 flex items-center gap-3 rounded-2xl p-2 pl-4"
                onSubmit={create}
              >
                <Sparkles className="size-5 shrink-0 text-[#ffc326]" />
                <input
                  className="min-w-0 flex-1 bg-transparent py-2 text-white outline-none placeholder:text-white/35"
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. When a lead fills my form, score it with AI and alert Telegram"
                  value={prompt}
                />
                <button
                  className="nf-gold-btn inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 font-semibold text-sm"
                  type="submit"
                >
                  Build <ArrowRight className="size-4" />
                </button>
              </form>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">Getting started</p>
                <span className="text-white/45 text-xs">{progress}/4</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  animate={{ width: `${(progress / 4) * 100}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-[#ffd34d] to-[#ff9f1c]"
                  initial={{ width: 0 }}
                  transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <ul className="mt-4 space-y-2.5 text-sm">
                {checklist.map((c) => (
                  <li className="flex items-center gap-2.5" key={c.label}>
                    {c.done ? (
                      <CheckCircle2 className="size-4 text-[#ffc326]" />
                    ) : (
                      <CircleDashed className="size-4 text-white/30" />
                    )}
                    <span
                      className={
                        c.done ? "text-white/50 line-through" : "text-white/80"
                      }
                    >
                      {c.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.section>

        {/* Stats */}
        <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Workflows", value: workflows.length, icon: Workflow },
            { label: "Active now", value: active, icon: Zap },
            {
              label: "Runs, last 7 days",
              value: data?.stats.runs7d ?? 0,
              icon: Activity,
            },
            {
              label: "Receipts on-chain",
              value: data?.stats.anchored ?? 0,
              icon: Fingerprint,
            },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="nf-card rounded-2xl p-5"
                initial={{ opacity: 0, y: 14 }}
                key={s.label}
                transition={{ delay: 0.1 + i * 0.06, duration: 0.5 }}
              >
                <div className="flex items-center justify-between text-white/45">
                  <span className="text-xs uppercase tracking-wider">
                    {s.label}
                  </span>
                  <Icon className="size-4 text-[#ffc326]/80" />
                </div>
                <p className="mt-3 font-display font-semibold text-3xl tabular-nums">
                  {loaded ? (
                    <CountUp value={s.value} />
                  ) : (
                    <span className="text-white/20">-</span>
                  )}
                </p>
              </motion.div>
            );
          })}
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Workflows */}
          <section>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-display font-semibold text-xl">
                Your workflows
              </h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/35" />
                  <input
                    className="nf-input h-9 w-44 py-0 pl-9 text-sm"
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search"
                    value={query}
                  />
                </div>
                <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-0.5">
                  {FILTERS.map((f) => (
                    <button
                      className={cn(
                        "relative rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                        filter === f
                          ? "text-[#0a0a0a]"
                          : "text-white/55 hover:text-white"
                      )}
                      key={f}
                      onClick={() => setFilter(f)}
                      type="button"
                    >
                      {filter === f && (
                        <motion.span
                          className="absolute inset-0 rounded-lg bg-[#ffc326]"
                          layoutId="nf-filter"
                          transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 34,
                          }}
                        />
                      )}
                      <span className="relative">{f}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2" ref={gridRef}>
              <Link
                className="nf-new-card group flex min-h-[176px] flex-col items-center justify-center gap-3 rounded-2xl p-5 text-center"
                data-card
                href="/build"
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-[#ffc326]/10 text-[#ffc326] transition-transform group-hover:rotate-90 group-hover:scale-110">
                  <Plus className="size-6" />
                </span>
                <span className="font-medium">Create a new workflow</span>
                <span className="text-white/45 text-xs">
                  Describe it, or start from a template
                </span>
              </Link>
              {!loaded &&
                [0, 1, 2].map((i) => (
                  <div
                    className="nf-card h-[176px] animate-pulse rounded-2xl"
                    key={i}
                  />
                ))}
              {filtered.map((w) => (
                <Link
                  className="nf-card nf-spotlight group relative flex min-h-[176px] flex-col rounded-2xl p-5 transition-transform hover:-translate-y-0.5"
                  data-card
                  href={`/workflows/${w.id}`}
                  key={w.id}
                  onPointerMove={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    event.currentTarget.style.setProperty(
                      "--x",
                      `${event.clientX - rect.left}px`
                    );
                    event.currentTarget.style.setProperty(
                      "--y",
                      `${event.clientY - rect.top}px`
                    );
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {w.enabled && w.published ? (
                          <span className="nf-live-dot size-2 rounded-full bg-emerald-400" />
                        ) : (
                          <span className="size-2 rounded-full bg-white/25" />
                        )}
                        <span className="text-[11px] text-white/45 uppercase tracking-wider">
                          {workflowState(w)} · {w.trigger}
                        </span>
                      </div>
                      <h3 className="mt-2 truncate font-semibold text-white">
                        {w.name}
                      </h3>
                      {w.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-white/50">
                          {w.description}
                        </p>
                      )}
                    </div>
                    <Toggle
                      disabled={busyToggle === w.id}
                      on={w.enabled && w.published}
                      onChange={() => toggle(w)}
                    />
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-5 text-white/45 text-xs">
                    <span className="flex items-center gap-3">
                      <span>{w.steps} steps</span>
                      <span>{w.runs} runs</span>
                      <span>{timeAgo(w.lastRunAt)}</span>
                    </span>
                    <StatusPill status={w.lastStatus} />
                  </div>
                </Link>
              ))}
            </div>
            {loaded && filtered.length === 0 && workflows.length > 0 && (
              <p className="mt-6 text-center text-sm text-white/40">
                Nothing matches this filter.
              </p>
            )}
          </section>

          {/* Side column */}
          <aside className="space-y-6">
            <section className="nf-card rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-semibold">Your apps</h2>
                <KeyRound className="size-4 text-[#ffc326]/80" />
              </div>
              <p className="mt-1 text-white/45 text-xs leading-relaxed">
                Workflows run with your own credentials. They're encrypted in
                our vault and only used for your runs.
              </p>
              <ul className="mt-4 space-y-2">
                {APPS.map((app) => {
                  const Icon = app.icon;
                  const ok = connected.has(app.type);
                  return (
                    <li
                      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5"
                      key={app.type}
                    >
                      <span
                        className={cn(
                          "grid size-9 place-items-center rounded-lg",
                          ok
                            ? "bg-[#ffc326] text-[#0a0a0a]"
                            : "bg-white/[0.06] text-white/60"
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-sm">
                          {app.label}
                        </span>
                        <span className="block truncate text-white/40 text-xs">
                          {ok ? "Connected" : app.hint}
                        </span>
                      </span>
                      {ok ? (
                        <CheckCircle2 className="size-4 text-emerald-400" />
                      ) : (
                        <button
                          className="rounded-lg border border-[#ffc326]/40 px-2.5 py-1 font-medium text-[#ffe08a] text-xs hover:bg-[#ffc326]/10"
                          onClick={() => open(IntegrationsOverlay, {})}
                          type="button"
                        >
                          Connect
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="nf-card rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-semibold">Recent runs</h2>
                <span className="flex items-center gap-1.5 text-white/40 text-xs">
                  <span className="nf-live-dot size-1.5 rounded-full bg-[#ffc326]" />{" "}
                  live
                </span>
              </div>
              <ol className="relative mt-4 space-y-1 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px before:bg-white/10">
                <AnimatePresence initial={false}>
                  {(data?.recentRuns ?? []).map((r) => (
                    <motion.li
                      animate={{ opacity: 1, x: 0 }}
                      initial={{ opacity: 0, x: -8 }}
                      key={r.id}
                      layout
                    >
                      <div className="flex items-start gap-3 rounded-lg p-1.5 hover:bg-white/[0.03]">
                        <span
                          className={cn(
                            "relative mt-1 size-[15px] shrink-0 rounded-full border-2 border-[#0a0a0a]",
                            RUN_DOT[r.status] ?? "bg-amber-300"
                          )}
                        />
                        <Link
                          className="min-w-0 flex-1"
                          href={`/workflows/${r.workflowId}`}
                        >
                          <span className="block truncate text-sm">
                            {r.workflowName}
                          </span>
                          <span className="flex items-center gap-2 text-white/40 text-xs">
                            {timeAgo(r.startedAt)} · {r.trigger ?? "manual"}
                            {r.receiptStatus === "anchored" && (
                              <span className="inline-flex items-center gap-0.5 text-[#ffc326]">
                                <ShieldCheck className="size-3" /> on-chain
                              </span>
                            )}
                          </span>
                        </Link>
                        {r.receiptStatus && (
                          <Link
                            className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-white/55 hover:border-[#ffc326]/50 hover:text-[#ffe08a]"
                            href={`/verify/${r.id}`}
                            target="_blank"
                          >
                            Verify
                          </Link>
                        )}
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
                {loaded && (data?.recentRuns.length ?? 0) === 0 && (
                  <li className="pl-7 text-sm text-white/40">
                    Runs appear here the moment they start.
                  </li>
                )}
              </ol>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
