"use client";

import type { NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";
import { BeeMark } from "@/components/brand/brand-lockup";
import { Button } from "@/components/ui/button";

type AddNodeData = {
  onClick?: () => void;
};

export function AddNode({ data }: NodeProps & { data?: AddNodeData }) {
  return (
    <div className="flex flex-col items-center justify-center gap-8 rounded-lg border border-border border-dashed bg-background/50 p-8 backdrop-blur-sm">
      <div className="text-center">
        <BeeMark className="mx-auto mb-4 size-14" />
        <h1 className="mb-2 font-bold font-display text-3xl tracking-tight">
          Flow<span className="text-brand-gradient">Ledger</span>
        </h1>
        <p className="text-muted-foreground text-sm">
          Automate anything. Prove everything.
        </p>
        <p className="mt-1 text-muted-foreground/70 text-xs uppercase tracking-[0.14em]">
          by TRNT BEE
        </p>
      </div>
      <Button className="gap-2 shadow-lg" onClick={data.onClick} size="default">
        <Plus className="size-4" />
        Add a Step
      </Button>
    </div>
  );
}
