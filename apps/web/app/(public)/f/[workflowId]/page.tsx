import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { PublicForm } from "@/components/forms/public-form";
import { loadPublicForm } from "@/lib/forms/server";

type Props = { params: Promise<{ workflowId: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workflowId } = await params;
  const target = await loadPublicForm(workflowId);
  return {
    title: target?.form.title ?? "Form",
    robots: { index: false, follow: false },
  };
}

export default async function HostedFormPage({ params }: Props) {
  const { workflowId } = await params;
  const target = await loadPublicForm(workflowId);
  if (!target) {
    notFound();
  }
  return (
    <main className="min-h-dvh bg-background px-4 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-xl">
        <div className="honeycomb-glow rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="font-display font-semibold text-2xl tracking-tight sm:text-3xl">
            {target.form.title}
          </h1>
          {target.form.description && (
            <p className="mt-2 whitespace-pre-line text-muted-foreground text-sm">
              {target.form.description}
            </p>
          )}
          <div className="mt-6">
            {target.open ? (
              <PublicForm form={target.form} workflowId={workflowId} />
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
                This form is not accepting responses right now.
              </p>
            )}
          </div>
        </div>
        <footer className="mt-6 flex flex-col items-center gap-2 text-center text-muted-foreground text-xs">
          <BrandLockup showByline={false} />
          <p>
            Every submission runs on N-Flow and gets a tamper-proof receipt.{" "}
            <a className="underline underline-offset-2" href="/legal/dpdp">
              Privacy notice
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
