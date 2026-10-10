import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { VerifyRun } from "@/components/ledger/verify-run";
import { getPublicReceipt } from "@/lib/ledger/public";

type Props = { params: Promise<{ executionId: string }> };

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verify a run",
  description:
    "Check a FlowLedger run's receipt against the blockchain, in your own browser.",
  robots: { index: false, follow: false },
};

export default async function VerifyPage({ params }: Props) {
  const { executionId } = await params;
  const receipt = await getPublicReceipt(executionId);
  if (!receipt) {
    notFound();
  }
  return (
    <main className="min-h-dvh bg-background px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-6 flex items-center justify-between gap-4">
          <a href="/">
            <BrandLockup />
          </a>
          <span className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
            Proof of Execution
          </span>
        </header>
        <h1 className="font-display font-semibold text-3xl tracking-tight">
          Did this automation really run,{" "}
          <span className="text-brand-gradient">exactly like this?</span>
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Every FlowLedger run gets a receipt. Receipts are batched into a
          Merkle tree and the root is written to a public blockchain. These
          checks run in your browser, so you don't have to trust us.
        </p>
        <div className="mt-6">
          <VerifyRun initial={receipt} />
        </div>
      </div>
    </main>
  );
}
