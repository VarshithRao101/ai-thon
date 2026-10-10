"use client";

import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { BeeMark } from "@/components/brand/brand-lockup";
import { markSigningOut } from "@/lib/auth/guest";
import { signOut } from "@/lib/auth-client";
import { normalizeConfig } from "@/lib/integrations/normalize";
import { cn } from "@/lib/utils";

const BOT_PREFIX = /^bot/i;
const BOT_TOKEN_SHAPE = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

type Saved = {
  id: string;
  name: string;
  type: string;
  status?: "ok" | "error" | "untested";
  lastTestedAt?: string | null;
};

type FieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  multiline?: boolean;
  optional?: boolean;
};

type AppDef = {
  type: "smtp-email" | "google-sheets" | "telegram";
  title: string;
  icon: typeof Mail;
  blurb: string;
  steps: ReactNode[];
  fields: FieldDef[];
  tryLabel: string;
};

const APPS: AppDef[] = [
  {
    type: "smtp-email",
    title: "Gmail",
    icon: Mail,
    blurb: "Send emails from your own Gmail address.",
    steps: [
      <>
        Turn on{" "}
        <A href="https://myaccount.google.com/signinoptions/twosv">
          2-Step Verification
        </A>{" "}
        for your Gmail.
      </>,
      <>
        Create an{" "}
        <A href="https://myaccount.google.com/apppasswords">app password</A>{" "}
        named "ZETA" and copy the 16 letters.
      </>,
      <>Paste your Gmail address and that app password below.</>,
    ],
    fields: [
      { key: "user", label: "Gmail address", placeholder: "you@gmail.com" },
      {
        key: "password",
        label: "App password",
        placeholder: "abcd efgh ijkl mnop",
        secret: true,
      },
      {
        key: "fromName",
        label: "Sender name",
        placeholder: "Your business name",
        optional: true,
      },
    ],
    tryLabel: "Send me a test email",
  },
  {
    type: "google-sheets",
    title: "Google Sheets",
    icon: FileSpreadsheet,
    blurb: "Add rows to your own Google Sheet.",
    steps: [
      <>
        In{" "}
        <A href="https://console.cloud.google.com/apis/library/sheets.googleapis.com">
          Google Cloud
        </A>
        , enable the Google Sheets API.
      </>,
      <>
        Create a{" "}
        <A href="https://console.cloud.google.com/iam-admin/serviceaccounts">
          service account
        </A>
        , then Keys → Add key → JSON. Paste the file's contents below.
      </>,
      <>
        Share your Sheet with the service account email we show you (as Editor),
        then paste the Sheet link.
      </>,
    ],
    fields: [
      {
        key: "serviceAccountJson",
        label: "Service account key (JSON)",
        placeholder: '{"type": "service_account", ...}',
        secret: true,
        multiline: true,
      },
      {
        key: "spreadsheetId",
        label: "Sheet link",
        placeholder: "https://docs.google.com/spreadsheets/d/…",
      },
    ],
    tryLabel: "Add a test row",
  },
  {
    type: "telegram",
    title: "Telegram",
    icon: Send,
    blurb: "Send alerts to your own Telegram group.",
    steps: [
      <>
        Open <A href="https://t.me/BotFather">@BotFather</A>, send /newbot and
        copy the token.
      </>,
      <>Add your bot to your group and send any message there.</>,
      <>Paste the token, press "Find my chats" and pick your group.</>,
    ],
    fields: [
      {
        key: "botToken",
        label: "Bot token",
        placeholder: "123456789:ABC…",
        secret: true,
      },
      {
        key: "chatId",
        label: "Chat",
        placeholder: "-100… (use Find my chats)",
      },
    ],
    tryLabel: "Send a test message",
  },
];

function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      className="inline-flex items-center gap-0.5 text-[#ffe08a] underline-offset-2 hover:underline"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  );
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return body;
}

function serviceAccountEmail(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { client_email?: string };
    return parsed.client_email ?? null;
  } catch {
    return null;
  }
}

function StatusChip({ saved }: { saved?: Saved }) {
  if (!saved) {
    return (
      <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/50">
        Not connected
      </span>
    );
  }
  if (saved.status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
        <CheckCircle2 className="size-3" /> Connected
      </span>
    );
  }
  if (saved.status === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300">
        <XCircle className="size-3" /> Needs attention
      </span>
    );
  }
  return (
    <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
      Saved, not tested
    </span>
  );
}

function AppCard({
  app,
  saved,
  onChange,
}: {
  app: AppDef;
  saved?: Saved;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(!saved);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null
  );
  const [chats, setChats] = useState<
    { id: string; title: string; type: string }[] | null
  >(null);
  const Icon = app.icon;
  const saEmail =
    app.type === "google-sheets"
      ? serviceAccountEmail(values.serviceAccountJson ?? "")
      : null;

  const set = (key: string, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  const test = useCallback(async (id: string) => {
    const r = await json<{ status: string; message: string }>(
      await fetch(`/api/integrations/${id}/test`, { method: "POST" })
    ).catch((e: Error) => ({ status: "error", message: e.message }));
    setResult({
      ok: r.status === "success",
      message: r.status === "success" ? "Connection works" : r.message,
    });
    return r.status === "success";
  }, []);

  // Same checks the server runs, shown while typing (lib/integrations/normalize.ts).
  const problems = useMemo(
    () => normalizeConfig(app.type, values).problems,
    [app.type, values]
  );

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validation, save, then test
  const save = async () => {
    const missing = app.fields.filter(
      (f) => !(f.optional || values[f.key]?.trim() || saved)
    );
    if (missing.length > 0) {
      toast.error(`Fill in: ${missing.map((m) => m.label).join(", ")}`);
      return;
    }
    if (problems.length > 0) {
      toast.error(problems[0] ?? "Check the details");
      return;
    }
    setBusy("save");
    setResult(null);
    try {
      const config = Object.fromEntries(
        Object.entries(values).filter(([, v]) => v.trim())
      );
      const res = saved
        ? await fetch(`/api/integrations/${saved.id}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ config }),
          })
        : await fetch("/api/integrations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ type: app.type, name: app.title, config }),
          });
      const body = await json<{ id: string }>(res);
      const ok = await test(body.id);
      toast[ok ? "success" : "error"](
        ok
          ? `${app.title} connected`
          : `${app.title} saved, but the test failed`
      );
      if (ok) {
        setValues({});
        setOpen(false);
      }
      onChange();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(null);
    }
  };

  const findChats = async () => {
    setBusy("chats");
    try {
      const body = await json<{
        bot: string | null;
        chats: { id: string; title: string; type: string }[];
      }>(
        await fetch("/api/integrations/telegram/chats", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            values.botToken
              ? { botToken: values.botToken }
              : { integrationId: saved?.id }
          ),
        })
      );
      setChats(body.chats);
      if (body.chats.length === 0) {
        toast.info(
          `No chats yet. Add @${body.bot ?? "your bot"} to your group, send a message there, then try again.`
        );
      } else if (body.chats.length === 1 && body.chats[0]) {
        set("chatId", body.chats[0].id);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not reach Telegram"
      );
    } finally {
      setBusy(null);
    }
  };

  // Paste a valid bot token and we look for your chats straight away.
  const lastToken = useRef("");
  const botToken = values.botToken;
  // biome-ignore lint/correctness/useExhaustiveDependencies: run only when the pasted token changes
  useEffect(() => {
    const token = (botToken ?? "").trim().replace(BOT_PREFIX, "");
    if (app.type !== "telegram" || token === lastToken.current) {
      return;
    }
    if (!BOT_TOKEN_SHAPE.test(token)) {
      return;
    }
    lastToken.current = token;
    const timer = setTimeout(() => {
      findChats().catch(() => undefined);
    }, 600);
    return () => clearTimeout(timer);
  }, [botToken]);

  const tryIt = async () => {
    if (!saved) {
      return;
    }
    setBusy("try");
    try {
      const body = await json<{ ok: boolean; message: string }>(
        await fetch(`/api/integrations/${saved.id}/try`, { method: "POST" })
      );
      setResult(body);
      toast[body.ok ? "success" : "error"](body.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test failed");
    } finally {
      setBusy(null);
    }
  };

  const [confirmRemove, setConfirmRemove] = useState(false);
  const remove = async () => {
    if (!saved) {
      return;
    }
    if (!confirmRemove) {
      setConfirmRemove(true);
      toast.info(
        `Click Remove again to disconnect ${app.title}. Workflows using it will stop.`
      );
      return;
    }
    setConfirmRemove(false);
    setBusy("remove");
    await fetch(`/api/integrations/${saved.id}`, { method: "DELETE" });
    setBusy(null);
    setResult(null);
    setOpen(true);
    onChange();
  };

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="nf-card overflow-hidden rounded-2xl"
      id={app.type}
      initial={{ opacity: 0, y: 14 }}
      transition={{ duration: 0.5 }}
    >
      <button
        className="flex w-full items-center gap-4 p-5 text-left"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span
          className={cn(
            "grid size-11 place-items-center rounded-xl",
            saved?.status === "ok"
              ? "bg-[#ffc326] text-[#0a0a0a]"
              : "bg-white/[0.06] text-white/70"
          )}
        >
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-display font-semibold text-lg text-white">
              {app.title}
            </span>
            <StatusChip saved={saved} />
          </span>
          <span className="block text-sm text-white/50">{app.blurb}</span>
        </span>
        <ChevronRight
          className={cn(
            "size-5 text-white/40 transition-transform",
            open && "rotate-90"
          )}
        />
      </button>

      {saved && (
        <div className="flex flex-wrap gap-2 border-white/[0.06] border-t px-5 py-3">
          <button
            className="nf-gold-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold text-xs"
            disabled={busy !== null}
            onClick={tryIt}
            type="button"
          >
            {busy === "try" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            {app.tryLabel}
          </button>
          <button
            className="nf-ghost-btn rounded-lg px-3 py-1.5 text-xs"
            disabled={busy !== null}
            onClick={() => saved && test(saved.id).then(onChange)}
            type="button"
          >
            Test connection
          </button>
          <button
            className="nf-ghost-btn rounded-lg px-3 py-1.5 text-xs"
            onClick={() => setOpen(true)}
            type="button"
          >
            Update details
          </button>
          <button
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-red-300/80 text-xs hover:bg-red-500/10"
            disabled={busy !== null}
            onClick={remove}
            type="button"
          >
            <Trash2 className="size-3.5" />{" "}
            {confirmRemove ? "Confirm remove" : "Remove"}
          </button>
        </div>
      )}

      {result && (
        <div
          className={cn(
            "mx-5 mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
            result.ok
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-400/30 bg-red-500/10 text-red-200"
          )}
        >
          {result.ok ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0" />
          )}
          {result.message}
        </div>
      )}

      {open && (
        <div className="grid gap-6 border-white/[0.06] border-t p-5 md:grid-cols-[1fr_1.2fr]">
          <ol className="space-y-3">
            {app.steps.map((step, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static steps
              <li className="flex gap-3 text-sm text-white/70" key={i}>
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#ffc326]/15 font-semibold text-[#ffc326] text-xs">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          <div className="space-y-3">
            {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one input per field with the Telegram chat picker */}
            {app.fields.map((f) => (
              <div className="block" key={f.key}>
                <label
                  className="mb-1 flex items-center gap-1.5 text-white/60 text-xs"
                  htmlFor={`${app.type}-${f.key}`}
                >
                  {f.secret && <KeyRound className="size-3" />}
                  {f.label}
                  {f.optional && (
                    <span className="text-white/30">(optional)</span>
                  )}
                </label>
                {f.multiline ? (
                  <textarea
                    autoComplete="off"
                    className="nf-input min-h-24 font-mono text-xs"
                    id={`${app.type}-${f.key}`}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={
                      saved && f.secret
                        ? "Saved. Paste a new one to replace it"
                        : f.placeholder
                    }
                    spellCheck={false}
                    value={values[f.key] ?? ""}
                  />
                ) : (
                  <div className="flex gap-2">
                    <input
                      autoComplete="off"
                      className="nf-input"
                      id={`${app.type}-${f.key}`}
                      onChange={(e) => set(f.key, e.target.value)}
                      placeholder={
                        saved && f.secret
                          ? "Saved. Type a new one to replace it"
                          : f.placeholder
                      }
                      type={f.secret ? "password" : "text"}
                      value={values[f.key] ?? ""}
                    />
                    {app.type === "telegram" && f.key === "chatId" && (
                      <button
                        className="nf-ghost-btn inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs"
                        disabled={busy !== null || !(values.botToken || saved)}
                        onClick={findChats}
                        type="button"
                      >
                        {busy === "chats" ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Search className="size-3.5" />
                        )}
                        Find my chats
                      </button>
                    )}
                  </div>
                )}
                {app.type === "telegram" &&
                  f.key === "chatId" &&
                  chats &&
                  chats.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {chats.map((c) => (
                        <button
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs",
                            values.chatId === c.id
                              ? "border-[#ffc326] bg-[#ffc326]/15 text-[#ffe08a]"
                              : "border-white/15 text-white/70 hover:border-white/30"
                          )}
                          key={c.id}
                          onClick={() => set("chatId", c.id)}
                          type="button"
                        >
                          {c.title} · {c.type}
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            ))}
            {saEmail && (
              <div className="rounded-xl border border-[#ffc326]/30 bg-[#ffc326]/[0.06] p-3 text-sm">
                <p className="text-white/70">
                  Share your Sheet with this email as <b>Editor</b>:
                </p>
                <button
                  className="mt-1.5 inline-flex max-w-full items-center gap-1.5 truncate font-mono text-[#ffe08a] text-xs"
                  onClick={() => {
                    navigator.clipboard
                      .writeText(saEmail)
                      .catch(() => undefined);
                    toast.success("Copied");
                  }}
                  type="button"
                >
                  <Copy className="size-3.5 shrink-0" /> {saEmail}
                </button>
              </div>
            )}
            {problems.length > 0 && (
              <ul className="space-y-1 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-amber-100 text-xs">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <button
              className="nf-gold-btn inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-sm"
              disabled={busy !== null}
              onClick={save}
              type="button"
            >
              {busy === "save" && <Loader2 className="size-4 animate-spin" />}
              {saved ? "Save and test" : `Connect ${app.title}`}
            </button>
            <p className="flex items-start gap-1.5 text-white/40 text-xs">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400/80" />
              Encrypted for your workspace only. Secrets are never shown again
              after saving.
            </p>
          </div>
        </div>
      )}
    </motion.section>
  );
}

export function ConnectionsPage() {
  const [saved, setSaved] = useState<Saved[] | null>(null);
  const load = useCallback(async () => {
    const res = await fetch("/api/integrations", { cache: "no-store" });
    setSaved(res.ok ? ((await res.json()) as Saved[]) : []);
  }, []);
  useEffect(() => {
    load().catch(() => setSaved([]));
  }, [load]);
  const byType = useMemo(() => {
    const map = new Map<string, Saved>();
    for (const s of saved ?? []) {
      if (!map.has(s.type)) {
        map.set(s.type, s);
      }
    }
    return map;
  }, [saved]);
  const connected = APPS.filter(
    (a) => byType.get(a.type)?.status === "ok"
  ).length;

  return (
    <div className="nf-landing pointer-events-auto relative min-h-dvh bg-[#0a0a0a] text-white">
      <div className="nf-hero-bg pointer-events-none fixed inset-0 opacity-60" />
      <header className="sticky top-0 z-40 border-white/[0.06] border-b bg-[#0a0a0a]/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link className="flex items-center gap-2" href="/dashboard">
            <BeeMark className="size-7" />
            <span className="font-display font-semibold tracking-tight">
              ZE<span className="text-[#ffc326]">TA</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              className="rounded-lg px-3 py-1.5 text-white/60 hover:bg-white/[0.04] hover:text-white"
              href="/dashboard"
            >
              Dashboard
            </Link>
            <Link
              className="rounded-lg px-3 py-1.5 text-white/60 hover:bg-white/[0.04] hover:text-white"
              href="/build"
            >
              Builder
            </Link>
            <span className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-white">
              Connections
            </span>
            <button
              className="ml-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-white/60 hover:bg-red-500/10 hover:text-red-200"
              onClick={async () => {
                markSigningOut();
                await signOut();
                window.location.replace("/");
              }}
              type="button"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </nav>
        </div>
      </header>
      <main className="relative mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white"
          href="/dashboard"
        >
          <ArrowLeft className="size-4" /> Dashboard
        </Link>
        <h1 className="mt-4 font-display font-semibold text-3xl tracking-tight sm:text-4xl">
          Connect your <span className="nf-gold-char">apps</span>
        </h1>
        <p className="mt-2 max-w-2xl text-white/55">
          Your workflows run with your own accounts. Connect once, then ask the
          AI to build anything with them.
          {saved && (
            <span className="ml-1 text-white/70">
              {connected} of {APPS.length} connected.
            </span>
          )}
        </p>
        <div className="mt-8 space-y-4">
          {saved === null
            ? [0, 1, 2].map((i) => (
                <div
                  className="nf-card h-24 animate-pulse rounded-2xl"
                  key={i}
                />
              ))
            : APPS.map((app) => (
                <AppCard
                  app={app}
                  key={app.type}
                  onChange={() => load()}
                  saved={byType.get(app.type)}
                />
              ))}
        </div>
        {connected > 0 && (
          <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-[#ffc326]/25 bg-[#ffc326]/[0.05] p-6 text-center">
            <p className="font-display font-semibold text-lg">
              Ready. Describe what you want to automate.
            </p>
            <Link
              className="nf-gold-btn inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-sm"
              href="/build"
            >
              Build with AI <ChevronRight className="size-4" />
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
