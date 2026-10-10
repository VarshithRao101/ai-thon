"use client";

import { createDrawable, createMotionPath, createTimeline, stagger } from "animejs";
import {
  Bot,
  FileSpreadsheet,
  FileText,
  Mail,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * "Sentence to system" motion graphic (anime.js): the hero workflow assembles,
 * its edges draw in, then data packets run it on a loop and the receipt seals.
 * Coordinates are in a 1000 x 420 frame; HTML nodes sit on top of the SVG.
 */
const W = 1000;
const H = 420;

const NODES = [
  { id: "form", x: 40, y: 182, label: "Form submitted", sub: "Hosted form + QR", icon: FileText },
  { id: "ai", x: 290, y: 182, label: "AI picks the track", sub: "Gemini, schema-checked", icon: Bot },
  { id: "sheet", x: 540, y: 52, label: "Sheets: add row", sub: "Google Sheets", icon: FileSpreadsheet },
  { id: "mail", x: 540, y: 182, label: "Email: send", sub: "Gmail, AI-drafted", icon: Mail },
  { id: "tg", x: 540, y: 312, label: "Telegram: alert", sub: "Team group", icon: Send },
  { id: "proof", x: 790, y: 182, label: "Receipt anchored", sub: "Polygon Amoy", icon: ShieldCheck },
] as const;

const NODE_W = 190;
const NODE_H = 58;

function edge(from: (typeof NODES)[number], to: (typeof NODES)[number]) {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
const EDGES = [
  ["form", "ai"],
  ["ai", "sheet"],
  ["ai", "mail"],
  ["ai", "tg"],
  ["sheet", "proof"],
  ["mail", "proof"],
  ["tg", "proof"],
] as const;

export function FlowDemo() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) {
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nodes = el.querySelectorAll<HTMLElement>("[data-node]");
    if (reduced) {
      for (const n of nodes) {
        n.style.opacity = "1";
        n.dataset.state = "done";
      }
      return;
    }
    const q = (s: string) => el.querySelector(s) as HTMLElement;
    const path = (i: number) => el.querySelector<SVGPathElement>(`[data-edge="${i}"]`);
    const setState = (id: string, state: string) => () => {
      const n = q(`[data-node="${id}"]`);
      if (n) {
        n.dataset.state = state;
      }
    };

    const intro = createTimeline({ autoplay: false, defaults: { ease: "outExpo" } })
      .add(nodes, {
        opacity: [0, 1],
        scale: [0.6, 1],
        translateY: [24, 0],
        duration: 900,
        delay: stagger(110),
      })
      .add(
        createDrawable(el.querySelectorAll("[data-edge]")),
        { draw: ["0 0", "0 1"], duration: 900, delay: stagger(90), ease: "inOutQuad" },
        "-=500"
      );

    const run = createTimeline({ autoplay: false, loop: true, loopDelay: 900 });
    const travel = (dot: string, i: number) => {
      const p = path(i);
      return p
        ? { ...createMotionPath(p), opacity: [0, 1, 1, 0], duration: 850, ease: "inOutSine" }
        : { duration: 850 };
    };
    run
      .call(() => {
        for (const n of nodes) {
          n.dataset.state = "idle";
        }
        setState("form", "running")();
      })
      .add(q("[data-dot='0']"), travel("0", 0), 300)
      .call(setState("form", "done"), "<<")
      .call(setState("ai", "running"))
      .add({ duration: 500 })
      .call(setState("ai", "done"))
      .call(() => {
        for (const id of ["sheet", "mail", "tg"]) {
          setState(id, "running")();
        }
      })
      .add(q("[data-dot='1']"), travel("1", 1))
      .add(q("[data-dot='2']"), travel("2", 2), "<<")
      .add(q("[data-dot='3']"), travel("3", 3), "<<")
      .call(() => {
        for (const id of ["sheet", "mail", "tg"]) {
          setState(id, "done")();
        }
        setState("proof", "running")();
      })
      .add(q("[data-dot='4']"), travel("4", 4))
      .add(q("[data-dot='5']"), travel("5", 5), "<<")
      .add(q("[data-dot='6']"), travel("6", 6), "<<")
      .call(setState("proof", "done"))
      .add(q("[data-seal]"), {
        scale: [1.8, 1],
        opacity: [0, 1],
        rotate: [-18, -8],
        duration: 700,
        ease: "outBack",
      })
      .add({ duration: 1600 })
      .add(q("[data-seal]"), { opacity: 0, duration: 300 });

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          intro.play();
          intro.then(() => run.play());
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      intro.pause();
      run.pause();
    };
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-5xl" ref={root}>
      <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg
          aria-hidden
          className="absolute inset-0 h-full w-full overflow-visible"
          viewBox={`0 0 ${W} ${H}`}
        >
          <defs>
            <linearGradient id="nf-edge" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#ffc326" stopOpacity="0.25" />
              <stop offset="1" stopColor="#ffc326" stopOpacity="0.85" />
            </linearGradient>
            <radialGradient id="nf-dot">
              <stop offset="0" stopColor="#fff6d6" />
              <stop offset="0.4" stopColor="#ffc326" />
              <stop offset="1" stopColor="#ffc326" stopOpacity="0" />
            </radialGradient>
          </defs>
          {EDGES.map(([a, b], i) => (
            <path
              d={edge(byId[a], byId[b])}
              data-edge={i}
              fill="none"
              key={`${a}-${b}`}
              stroke="url(#nf-edge)"
              strokeWidth="2"
            />
          ))}
          {EDGES.map(([a, b], i) => (
            <circle data-dot={i} fill="url(#nf-dot)" key={`dot-${a}-${b}`} opacity="0" r="9" />
          ))}
        </svg>
        {NODES.map((n) => {
          const Icon = n.icon;
          return (
            <div
              className="nf-node absolute flex items-center gap-2.5 rounded-xl border px-3"
              data-node={n.id}
              data-state="idle"
              key={n.id}
              style={{
                left: `${(n.x / W) * 100}%`,
                top: `${(n.y / H) * 100}%`,
                width: `${(NODE_W / W) * 100}%`,
                height: `${(NODE_H / H) * 100}%`,
                opacity: 0,
              }}
            >
              <span className="nf-node-icon grid size-8 shrink-0 place-items-center rounded-lg">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate font-medium text-[clamp(9px,1.25vw,13px)] text-white">
                  {n.label}
                </span>
                <span className="block truncate text-[clamp(8px,1vw,11px)] text-white/50">
                  {n.sub}
                </span>
              </span>
            </div>
          );
        })}
        <div
          className="pointer-events-none absolute rounded-md border-2 border-[#ffc326] px-2 py-0.5 font-display font-bold text-[#ffc326] text-[clamp(9px,1.2vw,13px)] uppercase tracking-[0.18em]"
          data-seal
          style={{ left: "80%", top: "68%", opacity: 0 }}
        >
          Verified on-chain
        </div>
      </div>
    </div>
  );
}
