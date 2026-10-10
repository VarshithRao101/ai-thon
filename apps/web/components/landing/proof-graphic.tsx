"use client";

import { animate, createDrawable, createTimeline, stagger } from "animejs";
import { RotateCcw, ShieldAlert, ShieldCheck, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Proof-of-Execution motion graphic (anime.js): four step receipts hash up a
 * Merkle tree into one root, and the root is anchored in a block. "Tamper"
 * edits one step and the broken path lights red, exactly what /verify shows.
 */
const HEX = "0123456789abcdef";
const LEAVES = [
  { step: "Form", hash: "3f9a…c21e" },
  { step: "AI", hash: "a17d…09b4" },
  { step: "Sheets", hash: "c4e2…7f10", tampered: "c4e9…1d77" },
  { step: "Email", hash: "5b08…e6a3" },
];
const LEAF_X = [80, 280, 480, 680];
const PARENT_X = [180, 580];
const ROOT_X = 380;

function scramble(el: HTMLElement, final: string, duration = 700) {
  const state = { p: 0 };
  animate(state, {
    p: 1,
    duration,
    ease: "linear",
    onUpdate: () => {
      el.textContent = final
        .split("")
        .map((ch, i) =>
          ch === "…" || i / final.length < state.p
            ? ch
            : HEX[Math.floor(Math.random() * 16)]
        )
        .join("");
    },
    onComplete: () => {
      el.textContent = final;
    },
  });
}

export function ProofGraphic() {
  const root = useRef<HTMLDivElement>(null);
  const [tampered, setTampered] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const n of el.querySelectorAll<HTMLElement>(
        "[data-leaf],[data-inner],[data-block]"
      )) {
        n.style.opacity = "1";
      }
      setReady(true);
      return;
    }
    const intro = createTimeline({
      autoplay: false,
      defaults: { ease: "outExpo" },
    })
      .add(el.querySelectorAll("[data-leaf]"), {
        opacity: [0, 1],
        translateY: [30, 0],
        duration: 700,
        delay: stagger(120),
      })
      .call(() => {
        for (const h of el.querySelectorAll<HTMLElement>("[data-hash]")) {
          scramble(h, h.dataset.hash ?? "");
        }
      }, "-=300")
      .add(
        createDrawable(el.querySelectorAll("[data-link]")),
        { draw: ["0 0", "0 1"], duration: 800, delay: stagger(80) },
        "+=200"
      )
      .add(
        el.querySelectorAll("[data-inner]"),
        {
          opacity: [0, 1],
          scale: [0.4, 1],
          duration: 600,
          delay: stagger(140),
        },
        "-=500"
      )
      .add(
        el.querySelector("[data-block]") as HTMLElement,
        {
          opacity: [0, 1],
          translateY: [-40, 0],
          rotate: [-12, 0],
          duration: 900,
          ease: "outBack",
        },
        "-=200"
      )
      .call(() => setReady(true));
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          intro.play();
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      intro.pause();
    };
  }, []);

  const toggle = () => {
    const next = !tampered;
    setTampered(next);
    const el = root.current;
    const hash = el?.querySelector<HTMLElement>("[data-hash-target]");
    if (hash) {
      scramble(hash, next ? (LEAVES[2].tampered ?? "") : LEAVES[2].hash, 450);
    }
    if (next && el) {
      animate(el.querySelectorAll("[data-shake]"), {
        translateX: [0, -6, 6, -4, 4, 0],
        duration: 450,
        ease: "inOutSine",
      });
    }
  };

  const bad = (on: boolean) => tampered && on;

  return (
    <div className="relative" ref={root}>
      <div className="relative mx-auto aspect-[760/400] w-full max-w-3xl">
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 760 400"
        >
          {LEAF_X.map((x, i) => (
            <path
              className={cn(
                "transition-colors duration-500",
                bad(i === 2) ? "stroke-red-400" : "stroke-[#ffc326]/60"
              )}
              d={`M ${x} 300 C ${x} 260, ${PARENT_X[Math.floor(i / 2)]} 250, ${PARENT_X[Math.floor(i / 2)]} 210`}
              data-link
              fill="none"
              key={`leaf-${x}`}
              strokeWidth="2"
            />
          ))}
          {PARENT_X.map((x, i) => (
            <path
              className={cn(
                "transition-colors duration-500",
                bad(i === 1) ? "stroke-red-400" : "stroke-[#ffc326]/70"
              )}
              d={`M ${x} 180 C ${x} 140, ${ROOT_X} 140, ${ROOT_X} 110`}
              data-link
              fill="none"
              key={`parent-${x}`}
              strokeWidth="2"
            />
          ))}
          <path
            className={cn(
              "transition-colors duration-500",
              tampered ? "stroke-red-400" : "stroke-[#ffc326]"
            )}
            d={`M ${ROOT_X} 80 L ${ROOT_X} 46`}
            data-link
            fill="none"
            strokeDasharray="4 5"
            strokeWidth="2"
          />
        </svg>

        {/* Anchored block */}
        <div
          className={cn(
            "absolute top-0 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl border px-3 py-1.5 font-mono text-[clamp(9px,1.3vw,12px)] transition-colors duration-500",
            tampered
              ? "border-red-400/60 bg-red-500/10 text-red-200"
              : "border-[#ffc326]/60 bg-[#ffc326]/10 text-[#ffe08a]"
          )}
          data-block
          data-shake
          style={{ opacity: 0 }}
        >
          <Zap className="size-3.5" />
          Polygon Amoy · root anchored
        </div>

        {/* Root and parents */}
        <Hash
          bad={tampered}
          label="Merkle root"
          value="9e41…b7c2"
          x={ROOT_X}
          y={95}
        />
        {PARENT_X.map((x, i) => (
          <Hash
            bad={bad(i === 1)}
            key={x}
            label={i === 0 ? "Node A" : "Node B"}
            value={i === 0 ? "71c0…4a9d" : "e8f3…02b6"}
            x={x}
            y={195}
          />
        ))}

        {/* Leaves = step receipts */}
        {LEAVES.map((leaf, i) => (
          <div
            className={cn(
              "absolute w-[22%] -translate-x-1/2 rounded-xl border p-2 text-center transition-colors duration-500 sm:p-3",
              bad(i === 2)
                ? "border-red-400/70 bg-red-500/10"
                : "border-white/10 bg-white/[0.03]"
            )}
            data-leaf
            data-shake={i === 2 ? true : undefined}
            key={leaf.step}
            style={{
              left: `${(LEAF_X[i] / 760) * 100}%`,
              top: `${(300 / 400) * 100}%`,
              opacity: 0,
            }}
          >
            <div className="text-[clamp(8px,1.1vw,11px)] text-white/50 uppercase tracking-widest">
              Step {i + 1} · {leaf.step}
            </div>
            <div
              className={cn(
                "mt-1 font-mono text-[clamp(9px,1.4vw,14px)]",
                bad(i === 2) ? "text-red-300" : "text-[#ffe08a]"
              )}
              data-hash={leaf.hash}
              data-hash-target={i === 2 ? true : undefined}
            >
              {leaf.hash}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <div
          aria-live="polite"
          className={cn(
            "flex items-center gap-2 rounded-full border px-4 py-2 font-medium text-sm transition-colors duration-500",
            tampered
              ? "border-red-400/50 bg-red-500/10 text-red-200"
              : "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
          )}
        >
          {tampered ? (
            <ShieldAlert className="size-4" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          {tampered
            ? "Tampered at step 3: the hash no longer matches the anchored root"
            : "Verified: every step matches the root on Polygon"}
        </div>
        <button
          className="nf-ghost-btn inline-flex items-center gap-2 rounded-full px-4 py-2 font-medium text-sm disabled:opacity-40"
          disabled={!ready}
          onClick={toggle}
          type="button"
        >
          {tampered ? (
            <>
              <RotateCcw className="size-4" /> Restore the log
            </>
          ) : (
            <>
              <ShieldAlert className="size-4" /> Tamper with step 3
            </>
          )}
        </button>
      </div>
      <p className="mt-4 text-center text-white/40 text-xs">
        Illustration with shortened hashes. Every real run has a public Verify
        page that checks its receipt against the chain in your browser.
      </p>
    </div>
  );
}

function Hash({
  x,
  y,
  label,
  value,
  bad,
}: {
  x: number;
  y: number;
  label: string;
  value: string;
  bad: boolean;
}) {
  return (
    <div
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border px-2.5 py-1 text-center transition-colors duration-500",
        bad
          ? "border-red-400/60 bg-red-500/10"
          : "border-[#ffc326]/40 bg-[#0d0b05]"
      )}
      data-inner
      style={{
        left: `${(x / 760) * 100}%`,
        top: `${(y / 400) * 100}%`,
        opacity: 0,
      }}
    >
      <div className="text-[clamp(7px,1vw,10px)] text-white/40 uppercase tracking-widest">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-[clamp(9px,1.3vw,13px)]",
          bad ? "text-red-300" : "text-[#ffe08a]"
        )}
      >
        {bad ? "mismatch" : value}
      </div>
    </div>
  );
}
