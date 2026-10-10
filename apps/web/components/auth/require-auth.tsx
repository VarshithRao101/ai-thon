"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { BeeMark } from "@/components/brand/brand-lockup";
import { isGuest } from "@/lib/auth/guest";
import { useSession } from "@/lib/auth-client";

/** The builder and dashboard are for signed-in users only: everyone else goes to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const guest = isGuest(session?.user);

  useEffect(() => {
    if (!isPending && guest) {
      const next = `${pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [isPending, guest, pathname, router]);

  if (isPending || guest) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-[#0a0a0a]">
        <BeeMark className="size-10 animate-pulse" />
      </div>
    );
  }
  return <>{children}</>;
}
