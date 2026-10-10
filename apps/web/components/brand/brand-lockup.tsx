import Image from "next/image";
import { cn } from "@/lib/utils";

type BeeMarkProps = {
  className?: string;
};

/** TRNT BEE bee mark: black on light surfaces, honey on dark ones. */
export function BeeMark({ className }: BeeMarkProps) {
  return (
    <span className={cn("relative inline-block size-7 shrink-0", className)}>
      <Image
        alt=""
        aria-hidden
        className="object-contain dark:hidden"
        fill
        sizes="64px"
        src="/brand/bee-mark-black.png"
      />
      <Image
        alt=""
        aria-hidden
        className="hidden object-contain dark:block"
        fill
        sizes="64px"
        src="/brand/bee-mark-honey.png"
      />
    </span>
  );
}

type BrandLockupProps = {
  className?: string;
  showByline?: boolean;
};

export function BrandLockup({
  className,
  showByline = true,
}: BrandLockupProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <BeeMark />
      <div className="leading-tight">
        <div className="font-display font-semibold text-sm tracking-tight">
          ZE<span className="text-primary">TA</span>
        </div>
        {showByline && (
          <div className="text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
            by TRNT BEE
          </div>
        )}
      </div>
    </div>
  );
}
