import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { workflows } from "@/lib/db/schema";
import { publicDb } from "@/lib/db/tenant";

type WorkflowLayoutProps = {
  children: ReactNode;
  params: Promise<{ workflowId: string }>;
};

export async function generateMetadata({
  params,
}: WorkflowLayoutProps): Promise<Metadata> {
  const { workflowId } = await params;

  // Try to fetch the workflow to get its name
  let title = "Workflow";
  let isPublic = false;

  try {
    // No tenant context: RLS exposes public workflows only (no name enumeration).
    const [workflow] = await publicDb((tx) =>
      tx
        .select({ name: workflows.name, visibility: workflows.visibility })
        .from(workflows)
        .where(eq(workflows.id, workflowId))
        .limit(1)
    );

    if (workflow) {
      isPublic = workflow.visibility === "public";
      // Only expose workflow name in metadata if it's public
      // This prevents private workflow name enumeration
      if (isPublic) {
        title = workflow.name;
      }
    }
  } catch {
    // Ignore errors, use defaults
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const workflowUrl = `${baseUrl}/workflows/${workflowId}`;
  const ogImageUrl = isPublic
    ? `${baseUrl}/api/og/workflow/${workflowId}`
    : `${baseUrl}/og-default.png`;

  return {
    title, // root layout template appends " | N-Flow"
    description: `View and explore the "${title}" workflow built with N-Flow.`,
    openGraph: {
      title: `${title} | N-Flow`,
      description: `View and explore the "${title}" workflow built with N-Flow.`,
      type: "website",
      url: workflowUrl,
      siteName: "N-Flow",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${title} workflow visualization`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | N-Flow`,
      description: `View and explore the "${title}" workflow built with N-Flow.`,
      images: [ogImageUrl],
    },
  };
}

export default function WorkflowLayout({ children }: WorkflowLayoutProps) {
  return children;
}
