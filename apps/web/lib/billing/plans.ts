import type { WorkspacePlan } from "@/lib/db/schema";

/**
 * Plans and credits (D-056). Credits are the workflows a workspace can keep
 * plus AI Copilot messages per calendar month (IST). Prices are planned, not
 * charged yet: every new workspace starts on Starter as a free trial.
 * `null` = unlimited.
 */
export type PlanLimits = {
  id: WorkspacePlan;
  name: string;
  price: string;
  workflows: number | null;
  aiMessages: number | null;
};

export const PLANS: Record<WorkspacePlan, PlanLimits> = {
  free: {
    id: "free",
    name: "Starter",
    price: "₹99",
    workflows: 5,
    aiMessages: 50,
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: "₹499",
    workflows: 20,
    aiMessages: 500,
  },
  business: {
    id: "business",
    name: "Business",
    price: "₹1,999",
    workflows: null,
    aiMessages: 5000,
  },
};

export function planFor(plan: string | null | undefined): PlanLimits {
  return PLANS[
    (plan as WorkspacePlan) in PLANS ? (plan as WorkspacePlan) : "free"
  ];
}

/** Start of the current month in IST, and the next one (when credits reset). */
export function monthWindow(now = new Date()): { start: Date; resetsAt: Date } {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const offset = 5.5 * 60 * 60 * 1000;
  return {
    start: new Date(Date.UTC(y, m, 1) - offset),
    resetsAt: new Date(Date.UTC(y, m + 1, 1) - offset),
  };
}
