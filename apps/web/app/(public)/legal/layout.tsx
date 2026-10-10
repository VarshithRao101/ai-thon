import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand/brand-lockup";

const PAGES = [
  ["privacy", "Privacy"],
  ["dpdp", "DPDP notice"],
  ["terms", "Terms"],
  ["cookies", "Cookies"],
  ["security", "Security"],
  ["open-source", "Open source"],
] as const;

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-background px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <a href="/">
            <BrandLockup />
          </a>
          <nav
            aria-label="Legal pages"
            className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-sm"
          >
            {PAGES.map(([slug, label]) => (
              <a
                className="hover:text-foreground"
                href={`/legal/${slug}`}
                key={slug}
              >
                {label}
              </a>
            ))}
          </nav>
        </header>
        <article className="legal mt-8 space-y-4 text-sm leading-relaxed [&_h1]:font-display [&_h1]:font-semibold [&_h1]:text-3xl [&_h1]:tracking-tight [&_h2]:mt-8 [&_h2]:font-display [&_h2]:font-semibold [&_h2]:text-lg [&_li]:ml-5 [&_li]:list-disc [&_li]:text-muted-foreground [&_p]:text-muted-foreground [&_td]:border-t [&_td]:py-2 [&_td]:pr-4 [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:font-medium">
          {children}
        </article>
        <footer className="mt-12 border-t pt-4 text-muted-foreground text-xs">
          These pages are templates written for a hackathon product. They are
          not legal advice and will be reviewed by a lawyer before any
          commercial launch.
        </footer>
      </div>
    </main>
  );
}
