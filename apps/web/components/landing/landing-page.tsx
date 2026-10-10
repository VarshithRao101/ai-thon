"use client";

import { animate, stagger, utils } from "animejs";
import {
  ArrowRight,
  Bot,
  Boxes,
  Check,
  KeyRound,
  LifeBuoy,
  QrCode,
  Radio,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { BeeMark } from "@/components/brand/brand-lockup";
import { isGuest } from "@/lib/auth/guest";
import { useSession } from "@/lib/auth-client";
import { FlowDemo } from "./flow-demo";
import { PrivacyGraphic } from "./privacy-graphic";

const HeroScene = dynamic(
  () => import("./hero-scene").then((m) => m.HeroScene),
  { ssr: false }
);

const PROMPTS = [
  "When someone registers for our hackathon, pick their track with AI, email them and log it in a sheet",
  "Score every new sales lead with AI and ping our Telegram group when it's hot",
  "When a patient books at my clinic, add it to a sheet and send a confirmation email",
  "Every morning at 9, post a short AI-written update to our Telegram group",
];

const INTEGRATIONS = [
  "Hosted forms",
  "Google Sheets",
  "Gmail",
  "Telegram",
  "Gemini AI",
  "Webhooks",
  "Schedules",
  "Conditions",
  "Delays",
  "HTTP requests",
];

const STEPS = [
  {
    n: "01",
    title: "Describe it",
    body: "Type it in plain English. AI builds the workflow.",
    icon: Sparkles,
  },
  {
    n: "02",
    title: "Run it",
    body: "Every step runs with retries. Watch it live.",
    icon: Workflow,
  },
  {
    n: "03",
    title: "Fix it fast",
    body: "Run Doctor explains failures and fixes them.",
    icon: LifeBuoy,
  },
];

const FEATURES = [
  {
    title: "Privacy Shield",
    body: "Emails, phones, Aadhaar, PAN and UPI are hidden from the AI.",
    icon: ShieldCheck,
    wide: true,
  },
  {
    title: "AI Copilot",
    body: "Sentence in, workflow out.",
    icon: Bot,
    wide: true,
  },
  {
    title: "Retries built in",
    body: "Failed steps retry automatically.",
    icon: RotateCcw,
  },
  {
    title: "Run Doctor",
    body: "Explains failures. Suggests the fix.",
    icon: LifeBuoy,
  },
  {
    title: "Live canvas",
    body: "See every step as it runs.",
    icon: Radio,
  },
  {
    title: "Forms + QR",
    body: "Share a link or QR. Any language.",
    icon: QrCode,
    wide: true,
  },
  {
    title: "Private workspaces",
    body: "Your data stays yours.",
    icon: Boxes,
  },
  {
    title: "Encrypted vault",
    body: "Your keys, encrypted.",
    icon: KeyRound,
  },
];

// Planned pricing from docs/13 (an estimate, not yet validated with customers).
const PLANS = [
  {
    name: "Free",
    price: "₹0",
    period: "forever",
    blurb: "Try it out",
    features: [
      "3 active workflows",
      "300 runs a month",
      "1 hosted form",
      "Community support",
      "90-day history",
    ],
    cta: "Start free",
    featured: false,
  },
  {
    name: "Pro",
    price: "₹499",
    period: "per month",
    blurb: "Small businesses",
    features: [
      "20 workflows",
      "5,000 runs a month",
      "Unlimited forms",
      "AI steps included",
      "Priority runs",
      "1-year history, 3 members",
    ],
    cta: "Choose Pro",
    featured: true,
  },
  {
    name: "Business",
    price: "₹1,999",
    period: "per month",
    blurb: "Teams",
    features: [
      "Unlimited workflows",
      "50,000 runs a month",
      "10 members with roles",
      "Audit log export",
      "Custom form domain",
      "Priority support",
    ],
    cta: "Choose Business",
    featured: false,
  },
];

// Measured on 10 Oct 2026 (docs/20 session log, docs/08). No estimates here.
const STATS = [
  { value: 126, label: "unit tests passing" },
  { value: 107, label: "live checks passing" },
  { value: 21, label: "of 22 test prompts built right by AI" },
  { value: 0, label: "known vulnerabilities" },
];

function Headline() {
  const ref = useRef<HTMLHeadingElement>(null);
  const lines = ["Automate anything.", "Just say it."];
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const chars = el.querySelectorAll<HTMLElement>("[data-char]");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const c of chars) {
        c.style.opacity = "1";
      }
      return;
    }
    animate(chars, {
      opacity: [0, 1],
      translateY: ["0.6em", "0em"],
      rotateX: [-80, 0],
      filter: ["blur(8px)", "blur(0px)"],
      duration: 1100,
      delay: stagger(28, { start: 250 }),
      ease: "outExpo",
    });
  }, []);
  return (
    <h1
      className="font-display font-semibold text-[clamp(2.6rem,8vw,6.2rem)] leading-[0.98] tracking-tight [perspective:600px]"
      ref={ref}
    >
      <span className="sr-only">{lines.join(" ")}</span>
      {lines.map((line, li) => (
        <span aria-hidden className="block" key={line}>
          {/* Words never break mid-word; characters animate one by one. */}
          {line.split(" ").map((word, wi, words) => (
            <span
              className="inline-block whitespace-nowrap"
              // biome-ignore lint/suspicious/noArrayIndexKey: words repeat; the index is the identity
              key={`${li}-${wi}`}
            >
              {word.split("").map((ch, i) => (
                <span
                  className={
                    li === 1
                      ? "nf-gold-char inline-block will-change-transform"
                      : "inline-block text-white will-change-transform"
                  }
                  data-char
                  // biome-ignore lint/suspicious/noArrayIndexKey: characters repeat; the index is the identity
                  key={`${li}-${wi}-${i}`}
                  style={{ opacity: 0 }}
                >
                  {ch}
                </span>
              ))}
              {wi < words.length - 1 && <span>&nbsp;</span>}
            </span>
          ))}
        </span>
      ))}
    </h1>
  );
}

function PromptBox() {
  const router = useRouter();
  const [hint, setHint] = useState("");
  const [value, setValue] = useState("");
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setHint(PROMPTS[0]);
      return;
    }
    let prompt = 0;
    let i = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const full = PROMPTS[prompt];
      i = deleting ? Math.max(0, i - 3) : Math.min(full.length, i + 1);
      setHint(full.slice(0, i));
      let delay = deleting ? 14 : 34;
      if (!deleting && i === full.length) {
        deleting = true;
        delay = 2200;
      } else if (deleting && i === 0) {
        deleting = false;
        prompt = (prompt + 1) % PROMPTS.length;
        delay = 400;
      }
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 1600);
    return () => clearTimeout(timer);
  }, []);

  // /build is sign-in only: guests land on /login and come back with the prompt.
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = value.trim() || hint.trim();
    router.push(
      text ? `/build?prompt=${encodeURIComponent(text)}` : "/dashboard"
    );
  };

  return (
    <form
      className="nf-prompt group relative flex w-full max-w-2xl items-center gap-3 rounded-2xl py-2 pr-2 pl-4 sm:pl-5"
      onSubmit={submit}
    >
      <Sparkles className="size-5 shrink-0 text-[#ffc326]" />
      <div className="relative min-w-0 flex-1">
        <input
          aria-label="Describe an automation"
          className="w-full bg-transparent py-2 text-sm text-white outline-none sm:text-base"
          onChange={(e) => setValue(e.target.value)}
          value={value}
        />
        {!value && (
          <span className="pointer-events-none absolute inset-0 flex items-center truncate text-sm text-white/45 sm:text-base">
            {hint}
            <span className="nf-caret ml-0.5 inline-block h-[1.1em] w-[2px] bg-[#ffc326]" />
          </span>
        )}
      </div>
      <button
        className="nf-gold-btn inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2.5 font-semibold text-sm"
        type="submit"
      >
        <span className="hidden sm:inline">Build it</span>
        <ArrowRight className="size-4" />
      </button>
    </form>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const format = (n: number) => Math.round(n).toLocaleString("en-IN");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = format(value);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) {
          return;
        }
        observer.disconnect();
        const state = { n: 0 };
        animate(state, {
          n: value,
          duration: 1800,
          ease: "outExpo",
          modifier: utils.round(0),
          onUpdate: () => {
            el.textContent = format(state.n);
          },
        });
      },
      { threshold: 0.6 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);
  return (
    <div className="nf-card rounded-2xl p-6">
      <span
        className="nf-gold-text block font-display font-semibold text-4xl tabular-nums sm:text-5xl"
        ref={ref}
      >
        0
      </span>
      <span className="mt-2 block text-sm text-white/55">{label}</span>
    </div>
  );
}

function Spotlight({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`nf-card nf-spotlight group relative overflow-hidden rounded-2xl ${className ?? ""}`}
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
      {children}
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  sub,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: ReactNode;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section className="relative px-4 py-24 sm:px-6 sm:py-32" id={id}>
      <motion.div
        className="mx-auto mb-14 max-w-3xl text-center"
        initial={{ opacity: 0, y: 28 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        viewport={{ once: true, margin: "-80px" }}
        whileInView={{ opacity: 1, y: 0 }}
      >
        <p className="mb-4 font-display text-[#ffc326] text-xs uppercase tracking-[0.3em]">
          {eyebrow}
        </p>
        <h2 className="font-display font-semibold text-3xl text-white leading-tight tracking-tight sm:text-5xl">
          {title}
        </h2>
        {sub && (
          <p className="mx-auto mt-5 max-w-2xl text-base text-white/60 sm:text-lg">
            {sub}
          </p>
        )}
      </motion.div>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

export function LandingPage() {
  const { data: session } = useSession();
  const signedIn = !isGuest(session?.user);
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const sceneOpacity = useTransform(scrollYProgress, [0, 0.9], [1, 0]);
  const sceneScale = useTransform(scrollYProgress, [0, 1], [1, 1.15]);
  const copyY = useTransform(scrollYProgress, [0, 1], [0, 120]);

  return (
    <div className="nf-landing relative min-h-dvh overflow-x-clip bg-[#0a0a0a] text-white">
      {/* Nav */}
      <header className="fixed inset-x-0 top-0 z-50">
        <div className="nf-nav mx-auto mt-3 flex max-w-6xl items-center justify-between rounded-2xl px-4 py-2.5 sm:mx-4 lg:mx-auto">
          <Link className="flex items-center gap-2" href="/">
            <BeeMark className="size-7" />
            <span className="font-display font-semibold tracking-tight">
              N-<span className="text-[#ffc326]">Flow</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-white/65 md:flex">
            <a className="transition-colors hover:text-white" href="#how">
              How it works
            </a>
            <a className="transition-colors hover:text-white" href="#demo">
              Live flow
            </a>
            <a className="transition-colors hover:text-white" href="#privacy">
              Privacy
            </a>
            <a className="transition-colors hover:text-white" href="#features">
              Features
            </a>
            <a className="transition-colors hover:text-white" href="#plans">
              Plans
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {signedIn ? null : (
              <Link
                className="hidden rounded-xl px-3 py-2 text-sm text-white/70 hover:text-white sm:inline-flex"
                href="/login"
              >
                Sign in
              </Link>
            )}
            <Link
              className="nf-gold-btn inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 font-semibold text-sm"
              href="/dashboard"
            >
              {signedIn ? "Dashboard" : "Get started"}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="relative min-h-dvh" ref={heroRef}>
        <div className="nf-hero-bg pointer-events-none absolute inset-0" />
        <motion.div
          className="absolute inset-0"
          style={{ opacity: sceneOpacity, scale: sceneScale }}
        >
          <HeroScene className="absolute inset-0" />
        </motion.div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-[#0a0a0a]" />
        <motion.div
          className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col justify-center px-4 pt-28 pb-20 sm:px-6"
          style={{ y: copyY }}
        >
          <motion.p
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-[#ffc326]/30 bg-[#ffc326]/[0.07] px-3 py-1 text-[#ffe08a] text-xs"
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            <span className="nf-live-dot size-1.5 rounded-full bg-[#ffc326]" />
            AI automations, private by design
          </motion.p>
          <Headline />
          <motion.p
            animate={{ opacity: 1, y: 0 }}
            className="mt-7 max-w-xl text-base text-white/65 sm:text-lg"
            initial={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.8, delay: 1.1 }}
          >
            Forms, Sheets, Gmail, Telegram. Built by AI in seconds.
          </motion.p>
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="mt-9 flex flex-col gap-5"
            initial={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.8, delay: 1.35 }}
          >
            <PromptBox />
            <div className="flex flex-wrap items-center gap-3">
              <Link
                className="nf-gold-btn inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold"
                href="/dashboard"
              >
                {signedIn ? "Open dashboard" : "Sign in with Google"}
                <ArrowRight className="size-4" />
              </Link>
              <a
                className="nf-ghost-btn inline-flex items-center gap-2 rounded-xl px-5 py-3 font-medium"
                href="#demo"
              >
                <Sparkles className="size-4" /> See it live
              </a>
            </div>
          </motion.div>
        </motion.div>
        <motion.a
          animate={{ opacity: 1 }}
          aria-label="Scroll to how it works"
          className="absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 md:block"
          href="#how"
          initial={{ opacity: 0 }}
          transition={{ delay: 2 }}
        >
          <span className="flex h-10 w-6 justify-center rounded-full border border-white/25 pt-2">
            <span className="nf-scroll-dot h-2 w-1 rounded-full bg-[#ffc326]" />
          </span>
        </motion.a>
      </div>

      {/* Integrations marquee */}
      <div className="relative border-white/[0.06] border-y bg-white/[0.015] py-5">
        <div className="nf-marquee-mask overflow-hidden">
          <div className="nf-marquee flex w-max gap-10">
            {[...INTEGRATIONS, ...INTEGRATIONS].map((name, i) => (
              <span
                className="flex items-center gap-10 whitespace-nowrap font-display text-sm text-white/45 uppercase tracking-[0.25em]"
                // biome-ignore lint/suspicious/noArrayIndexKey: the list is duplicated for a seamless loop
                key={`${name}-${i}`}
              >
                {name}
                <span className="size-1.5 rotate-45 bg-[#ffc326]/60" />
              </span>
            ))}
          </div>
        </div>
      </div>

      <Section
        eyebrow="How it works"
        id="how"
        sub="Three steps. No code."
        title={
          <>
            Describe. Run. <span className="nf-gold-text">Done.</span>
          </>
        }
      >
        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                key={step.n}
                transition={{
                  duration: 0.8,
                  delay: i * 0.12,
                  ease: [0.16, 1, 0.3, 1],
                }}
                viewport={{ once: true, margin: "-60px" }}
                whileInView={{ opacity: 1, y: 0 }}
              >
                <Spotlight className="h-full p-7">
                  <div className="flex items-center justify-between">
                    <span className="grid size-11 place-items-center rounded-xl bg-[#ffc326]/10 text-[#ffc326]">
                      <Icon className="size-5" />
                    </span>
                    <span className="font-display text-4xl text-white/10">
                      {step.n}
                    </span>
                  </div>
                  <h3 className="mt-6 font-display font-semibold text-white text-xl">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-white/60 leading-relaxed">
                    {step.body}
                  </p>
                </Spotlight>
              </motion.div>
            );
          })}
        </div>
      </Section>

      <Section
        eyebrow="Live flow"
        id="demo"
        sub="Form in. AI decides. Sheet, email, Telegram."
        title={
          <>
            One submission. Four systems.{" "}
            <span className="nf-gold-text">Zero code.</span>
          </>
        }
      >
        <div className="nf-card relative overflow-hidden rounded-3xl px-3 py-10 sm:px-8 sm:py-14">
          <div className="nf-grid-bg pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative">
            <FlowDemo />
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Privacy Shield"
        id="privacy"
        sub="Personal details are swapped for placeholders before every AI call, then restored on our server. Built for India's DPDP Act."
        title={
          <>
            Your customers' data{" "}
            <span className="nf-gold-text">never reaches the AI</span>
          </>
        }
      >
        <PrivacyGraphic />
      </Section>

      <Section
        eyebrow="Everything in the box"
        id="features"
        title={
          <>
            Everything <span className="nf-gold-text">built in</span>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                className={feature.wide ? "lg:col-span-2" : ""}
                initial={{ opacity: 0, y: 30, scale: 0.97 }}
                key={feature.title}
                transition={{
                  duration: 0.7,
                  delay: (i % 4) * 0.08,
                  ease: [0.16, 1, 0.3, 1],
                }}
                viewport={{ once: true, margin: "-40px" }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
              >
                <Spotlight className="h-full p-6">
                  <Icon className="size-5 text-[#ffc326]" />
                  <h3 className="mt-4 font-display font-semibold text-lg text-white">
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-white/55 leading-relaxed">
                    {feature.body}
                  </p>
                </Spotlight>
              </motion.div>
            );
          })}
        </div>
      </Section>

      <Section
        eyebrow="Plans"
        id="plans"
        sub="Bring your own apps. We build and run them."
        title={
          <>
            Simple <span className="nf-gold-text">pricing</span>
          </>
        }
      >
        <div className="grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan, i) => (
            <motion.div
              initial={{ opacity: 0, y: 36 }}
              key={plan.name}
              transition={{
                duration: 0.8,
                delay: i * 0.1,
                ease: [0.16, 1, 0.3, 1],
              }}
              viewport={{ once: true, margin: "-60px" }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <div
                className={`relative flex h-full flex-col rounded-3xl p-7 ${plan.featured ? "nf-plan-featured" : "nf-card"}`}
              >
                {plan.featured && (
                  <span className="absolute -top-3 left-7 rounded-full bg-[#ffc326] px-3 py-1 font-semibold text-[#0a0a0a] text-xs">
                    Most popular
                  </span>
                )}
                <h3 className="font-display font-semibold text-white text-xl">
                  {plan.name}
                </h3>
                <p className="mt-1 text-sm text-white/50">{plan.blurb}</p>
                <p className="mt-6 flex items-baseline gap-2">
                  <span className="font-display font-semibold text-5xl text-white">
                    {plan.price}
                  </span>
                  <span className="text-sm text-white/45">{plan.period}</span>
                </p>
                <ul className="mt-6 space-y-3 text-sm">
                  {plan.features.map((f) => (
                    <li
                      className="flex items-center gap-2.5 text-white/75"
                      key={f}
                    >
                      <Check className="size-4 shrink-0 text-[#ffc326]" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  className={`mt-auto inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold ${plan.featured ? "nf-gold-btn" : "nf-ghost-btn"}`}
                  href="/dashboard"
                  style={{ marginTop: "2rem" }}
                >
                  {plan.cta} <ArrowRight className="size-4" />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
        <p className="mt-6 text-center text-white/35 text-xs">
          Free during the preview. Paid plans coming.
        </p>
      </Section>

      <Section
        eyebrow="Measured, not estimated"
        sub="Our own test runs, 10 Oct 2026."
        title="Measured"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((stat) => (
            <Stat key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </div>
      </Section>

      {/* Final CTA */}
      <section className="relative px-4 pt-10 pb-28 sm:px-6">
        <motion.div
          className="nf-cta relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] px-6 py-16 text-center sm:px-12 sm:py-20"
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          viewport={{ once: true, margin: "-60px" }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
        >
          <div className="nf-cta-glow pointer-events-none absolute inset-0" />
          <div className="relative">
            <BeeMark className="mx-auto size-12" />
            <h2 className="mx-auto mt-6 max-w-2xl font-display font-semibold text-3xl text-white leading-tight tracking-tight sm:text-5xl">
              Start <span className="nf-gold-text">automating</span>
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-white/60">
              One sentence is enough.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link
                className="nf-gold-btn inline-flex items-center gap-2 rounded-xl px-6 py-3.5 font-semibold"
                href="/dashboard"
              >
                Start building <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      <footer className="border-white/[0.06] border-t px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 text-sm text-white/45 md:flex-row">
          <div className="flex items-center gap-2">
            <BeeMark className="size-6" />
            <span>
              N-Flow by TRNT BEE · Team Hydra · TRI-CITY AI Hackathon 2026
            </span>
          </div>
          <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <Link className="hover:text-white" href="/legal/privacy">
              Privacy
            </Link>
            <Link className="hover:text-white" href="/legal/terms">
              Terms
            </Link>
            <Link className="hover:text-white" href="/legal/cookies">
              Cookies
            </Link>
            <Link className="hover:text-white" href="/legal/open-source">
              Open source
            </Link>
          </nav>
        </div>
        <p className="mx-auto mt-6 max-w-6xl text-center text-white/30 text-xs md:text-left">
          Built on Vercel's Workflow Builder Template (Apache-2.0).
        </p>
      </footer>
    </div>
  );
}
