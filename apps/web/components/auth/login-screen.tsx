"use client";

import { animate, stagger } from "animejs";
import { ArrowLeft, Loader2, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { BeeMark } from "@/components/brand/brand-lockup";
import { isGuest, safeNext } from "@/lib/auth/guest";
import { signIn, signUp, useSession } from "@/lib/auth-client";
import { getEnabledAuthProviders } from "@/lib/auth-providers";

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 48 48">
      <path
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
        fill="#FFC107"
      />
      <path
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
        fill="#FF3D00"
      />
      <path
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
        fill="#4CAF50"
      />
      <path
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
        fill="#1976D2"
      />
    </svg>
  );
}

const PERKS = [
  "Your workflows, runs and receipts, saved to your account",
  "Connect your own Gmail, Sheets and Telegram: your keys, encrypted",
  "Every run gets a public proof page",
];

function GoogleHint({ google, demo }: { google: boolean; demo: boolean }) {
  if (google) {
    return null;
  }
  if (demo) {
    return (
      <p className="text-center text-[#ffe08a]/70 text-xs">
        Test mode: Google isn't connected yet, so this signs you into your own
        demo account on this browser.
      </p>
    );
  }
  return (
    <p className="text-center text-white/40 text-xs">
      Google sign-in turns on once its OAuth keys are added. Use email
      meanwhile.
    </p>
  );
}

export function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { data: session, isPending } = useSession();
  const providers = useMemo(() => getEnabledAuthProviders(), []);
  const [mode, setMode] = useState<"choose" | "email">("choose");
  const [emailMode, setEmailMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const perksRef = useRef<HTMLUListElement>(null);
  // Until Google OAuth is configured, the Google button signs into a private
  // demo account instead (temporary, D-050).
  const [demoLogin, setDemoLogin] = useState(false);
  useEffect(() => {
    fetch("/api/demo-login")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d: { enabled?: boolean }) => setDemoLogin(Boolean(d.enabled)))
      .catch(() => setDemoLogin(false));
  }, []);

  const pendingPrompt = useMemo(() => {
    const url = new URL(next, "http://local");
    return url.searchParams.get("prompt");
  }, [next]);

  useEffect(() => {
    if (!(isPending || isGuest(session?.user))) {
      router.replace(next);
    }
  }, [isPending, session, next, router]);

  useEffect(() => {
    const items = perksRef.current?.querySelectorAll("li");
    if (
      items &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      animate(items, {
        opacity: [0, 1],
        translateX: [-16, 0],
        delay: stagger(120, { start: 400 }),
        duration: 700,
        ease: "outExpo",
      });
    }
  }, []);

  const google = async () => {
    setError(null);
    setBusy("google");
    if (!providers.google && demoLogin) {
      const res = await fetch("/api/demo-login", { method: "POST" });
      if (res.ok) {
        window.location.href = next;
        return;
      }
      setError("Demo sign-in failed. Try email instead.");
      setBusy(null);
      return;
    }
    try {
      await signIn.social({ provider: "google", callbackURL: next });
    } catch {
      setError("Google sign-in failed. Try again, or use email.");
      setBusy(null);
    }
  };

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    setError(null);
    setBusy("email");
    const result =
      emailMode === "signup"
        ? await signUp.email({
            email,
            password,
            name: name || email.split("@")[0],
          })
        : await signIn.email({ email, password });
    if (result.error) {
      setError(result.error.message ?? "That didn't work. Check the details.");
      setBusy(null);
      return;
    }
    router.replace(next);
  };

  return (
    <div className="nf-landing relative grid min-h-dvh bg-[#0a0a0a] text-white lg:grid-cols-[1.1fr_1fr]">
      {/* Brand side */}
      <div className="nf-hero-bg relative hidden overflow-hidden lg:block">
        <div className="nf-grid-bg absolute inset-0 opacity-50" />
        <div className="nf-orb nf-orb-a" />
        <div className="nf-orb nf-orb-b" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link className="flex items-center gap-2" href="/">
            <BeeMark className="size-8" />
            <span className="font-display font-semibold text-lg">
              N-<span className="text-[#ffc326]">Flow</span>
            </span>
          </Link>
          <div>
            <h1 className="max-w-md font-display font-semibold text-5xl leading-[1.05] tracking-tight">
              Automate anything.
              <br />
              <span className="nf-gold-char">Prove everything.</span>
            </h1>
            <ul className="mt-10 space-y-4" ref={perksRef}>
              {PERKS.map((perk) => (
                <li
                  className="flex items-start gap-3 text-white/70"
                  key={perk}
                  style={{ opacity: 0 }}
                >
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#ffc326]" />
                  {perk}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-white/35">
            N-Flow by TRNT BEE · Team Hydra
          </p>
        </div>
      </div>

      {/* Form side */}
      <div className="relative flex items-center justify-center px-5 py-16">
        <Link
          className="absolute top-6 left-5 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white"
          href="/"
        >
          <ArrowLeft className="size-4" /> Home
        </Link>
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <BeeMark className="size-11 lg:hidden" />
          <h2 className="mt-6 font-display font-semibold text-3xl tracking-tight lg:mt-0">
            Welcome to N-<span className="text-[#ffc326]">Flow</span>
          </h2>
          <p className="mt-2 text-white/55">
            Sign in to see your workflows, runs and history.
          </p>

          {pendingPrompt && (
            <div className="mt-6 flex gap-3 rounded-xl border border-[#ffc326]/25 bg-[#ffc326]/[0.06] p-3.5 text-sm">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-[#ffc326]" />
              <span className="text-white/75">
                After you sign in we'll build:{" "}
                <span className="text-white">
                  "{pendingPrompt.slice(0, 140)}"
                </span>
              </span>
            </div>
          )}

          <div className="mt-8 space-y-3">
            <button
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 font-semibold text-[#1f1f1f] transition hover:bg-white/90 disabled:opacity-50"
              disabled={!(providers.google || demoLogin) || busy !== null}
              onClick={google}
              type="button"
            >
              {busy === "google" ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              Continue with Google
            </button>
            <GoogleHint demo={demoLogin} google={providers.google} />

            <div className="flex items-center gap-3 py-2 text-white/30 text-xs">
              <span className="h-px flex-1 bg-white/10" /> or{" "}
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <AnimatePresence initial={false} mode="wait">
              {mode === "choose" ? (
                <motion.button
                  animate={{ opacity: 1 }}
                  className="nf-ghost-btn flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium"
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
                  key="choose"
                  onClick={() => setMode("email")}
                  type="button"
                >
                  <Mail className="size-4" /> Continue with email
                </motion.button>
              ) : (
                <motion.form
                  animate={{ opacity: 1, height: "auto" }}
                  className="space-y-3 overflow-hidden"
                  exit={{ opacity: 0, height: 0 }}
                  initial={{ opacity: 0, height: 0 }}
                  key="email"
                  onSubmit={submitEmail}
                >
                  {emailMode === "signup" && (
                    <input
                      autoComplete="name"
                      className="nf-input"
                      name="name"
                      placeholder="Your name"
                    />
                  )}
                  <input
                    autoComplete="email"
                    className="nf-input"
                    name="email"
                    placeholder="you@example.com"
                    required
                    type="email"
                  />
                  <input
                    autoComplete={
                      emailMode === "signup"
                        ? "new-password"
                        : "current-password"
                    }
                    className="nf-input"
                    minLength={8}
                    name="password"
                    placeholder="Password (8+ characters)"
                    required
                    type="password"
                  />
                  <button
                    className="nf-gold-btn flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold disabled:opacity-60"
                    disabled={busy !== null}
                    type="submit"
                  >
                    {busy === "email" && (
                      <Loader2 className="size-4 animate-spin" />
                    )}
                    {emailMode === "signup" ? "Create account" : "Sign in"}
                  </button>
                  <button
                    className="w-full text-center text-sm text-white/50 hover:text-white"
                    onClick={() =>
                      setEmailMode(emailMode === "signup" ? "signin" : "signup")
                    }
                    type="button"
                  >
                    {emailMode === "signup"
                      ? "Already have an account? Sign in"
                      : "New here? Create an account"}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>

            {error && (
              <p
                className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-200 text-sm"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>

          <p className="mt-10 text-white/35 text-xs leading-relaxed">
            By continuing you agree to the{" "}
            <Link className="underline hover:text-white" href="/legal/terms">
              Terms
            </Link>{" "}
            and{" "}
            <Link className="underline hover:text-white" href="/legal/privacy">
              Privacy Policy
            </Link>
            .
          </p>
        </motion.div>
      </div>
    </div>
  );
}
