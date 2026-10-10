import { NextResponse } from "next/server";
import { TEMPLATES } from "@/lib/ai/templates";

// GET /api/templates: the template gallery (public metadata only).
export function GET() {
  return NextResponse.json(
    TEMPLATES.map(({ slug, title, summary, plan }) => ({
      slug,
      title,
      summary,
      trigger: plan.trigger.type,
      steps: plan.steps.length,
    }))
  );
}
