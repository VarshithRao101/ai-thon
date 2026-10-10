"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { WorkflowCanvas } from "./workflow-canvas";

export function PersistentCanvas() {
  const pathname = usePathname();

  // Show canvas on the builder and workflow pages
  const showCanvas =
    pathname === "/build" || pathname.startsWith("/workflows/");

  // The full-screen canvas owns the wheel; every other page scrolls normally.
  useEffect(() => {
    document.documentElement.classList.toggle("nf-lock-scroll", showCanvas);
    return () => document.documentElement.classList.remove("nf-lock-scroll");
  }, [showCanvas]);

  if (!showCanvas) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-0">
      <WorkflowCanvas />
    </div>
  );
}
