"use client";

import { animate, createTimeline, stagger } from "animejs";
import { Bot, Lock, RotateCcw, ShieldCheck, User } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

/**
 * Privacy Shield motion graphic (anime.js): a form answer goes in, personal
 * data turns into placeholders before the AI sees it, and the real values
 * come back only on our server. Mirrors lib/ai/privacy.ts.
 */
const ROWS = [
  { label: "Name", value: "Asha Rao", token: "Asha Rao" },
  { label: "Email", value: "asha.rao@gmail.com", token: "[EMAIL_1]" },
  { label: "Phone", value: "+91 98765 43210", token: "[PHONE_1]" },
  { label: "Aadhaar", value: "2345 6789 0123", token: "[AADHAAR_1]" },
  { label: "UPI", value: "asha@okicici", token: "[UPI_1]" },
];
const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#@";

function scramble(el: HTMLElement, to: string, duration: number) {
  const state = { p: 0 };
  animate(state, {
    p: 1,
    duration,
    ease: "linear",
    onUpdate: () => {
      el.textContent = to
        .split("")
        .map((ch, i) =>
          i / to.length < state.p || ch === " "
            ? ch
            : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
        )
        .join("");
    },
    onComplete: () => {
      el.textContent = to;
    },
  });
}

export function PrivacyGraphic() {
  const root = useRef<HTMLDivElement>(null);

  const play = useCallback(() => {
    const el = root.current;
    if (!el) {
      return;
    }
    const masked = el.querySelectorAll<HTMLElement>("[data-masked]");
    const back = el.querySelectorAll<HTMLElement>("[data-back]");
    for (const m of masked) {
      m.textContent = m.dataset.value ?? "";
      m.dataset.hidden = "false";
    }
    for (const b of back) {
      b.style.opacity = "0";
    }
    createTimeline({ defaults: { ease: "outExpo" } })
      .add(el.querySelectorAll("[data-col]"), {
        opacity: [0, 1],
        translateY: [24, 0],
        duration: 700,
        delay: stagger(150),
      })
      .call(() => {
        masked.forEach((m, i) => {
          if (m.dataset.token !== m.dataset.value) {
            setTimeout(() => {
              scramble(m, m.dataset.token ?? "", 650);
              m.dataset.hidden = "true";
            }, i * 160);
          }
        });
      }, "+=200")
      .add(
        el.querySelectorAll("[data-flow]"),
        {
          opacity: [0, 1, 1, 0.35],
          scaleX: [0, 1],
          duration: 900,
          delay: stagger(200),
        },
        "+=900"
      )
      .add(
        back,
        {
          opacity: [0, 1],
          translateX: [-12, 0],
          duration: 500,
          delay: stagger(90),
        },
        "-=300"
      );
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const n of el.querySelectorAll<HTMLElement>(
        "[data-col],[data-back]"
      )) {
        n.style.opacity = "1";
      }
      for (const m of el.querySelectorAll<HTMLElement>("[data-masked]")) {
        m.textContent = m.dataset.token ?? "";
        m.dataset.hidden = "true";
      }
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          play();
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [play]);

  return (
    <div ref={root}>
      <div className="grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <Column data-col icon={User} title="Your data">
          {ROWS.map((r) => (
            <Row key={r.label} label={r.label}>
              <span className="text-white">{r.value}</span>
            </Row>
          ))}
        </Column>
        <Flow />
        <Column accent data-col icon={Bot} title="What the AI sees">
          {ROWS.map((r) => (
            <Row key={r.label} label={r.label}>
              <span
                className="nf-masked font-mono"
                data-hidden="false"
                data-masked
                data-token={r.token}
                data-value={r.value}
              >
                {r.value}
              </span>
            </Row>
          ))}
        </Column>
        <Flow />
        <Column data-col icon={Lock} title="What your workflow gets">
          {ROWS.map((r) => (
            <Row key={r.label} label={r.label}>
              <span
                className="inline-flex items-center gap-1.5 text-white"
                data-back
                style={{ opacity: 0 }}
              >
                <ShieldCheck className="size-3.5 text-emerald-400" />
                {r.value}
              </span>
            </Row>
          ))}
        </Column>
      </div>
      <div className="mt-6 flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-white/55">
          Emails, phones, Aadhaar, PAN, UPI and cards are hidden before every AI
          call.
        </p>
        <button
          className="nf-ghost-btn inline-flex items-center gap-2 rounded-full px-4 py-2 font-medium text-sm"
          onClick={play}
          type="button"
        >
          <RotateCcw className="size-4" /> Replay
        </button>
      </div>
    </div>
  );
}

function Column({
  title,
  icon: Icon,
  accent,
  children,
  ...rest
}: {
  title: string;
  icon: typeof User;
  accent?: boolean;
  children: React.ReactNode;
  "data-col"?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-5 ${accent ? "nf-plan-featured" : "nf-card"}`}
      style={{ opacity: 0 }}
      {...rest}
    >
      <div className="mb-4 flex items-center gap-2 font-display font-semibold text-white">
        <span
          className={`grid size-8 place-items-center rounded-lg ${accent ? "bg-[#ffc326] text-[#0a0a0a]" : "bg-white/[0.06] text-white/70"}`}
        >
          <Icon className="size-4" />
        </span>
        {title}
      </div>
      <ul className="space-y-2.5">{children}</ul>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-sm">
      <span className="text-white/40 text-xs uppercase tracking-wider">
        {label}
      </span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </li>
  );
}

function Flow() {
  return (
    <div className="hidden items-center md:flex">
      <span
        className="block h-0.5 w-10 origin-left rounded-full bg-gradient-to-r from-[#ffc326]/20 to-[#ffc326]"
        data-flow
        style={{ opacity: 0 }}
      />
    </div>
  );
}
