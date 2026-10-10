import type { Metadata, Viewport } from "next";
import "./globals.css";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { display, mono, sans } from "@/lib/fonts";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: {
    default: "FlowLedger | Automate anything. Prove everything.",
    template: "%s | FlowLedger",
  },
  description:
    "AI-powered no-code automation with blockchain-verified execution. Describe a workflow in plain English, run it reliably, and prove every run. By TRNT BEE.",
  applicationName: "FlowLedger",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

type RootLayoutProps = {
  children: ReactNode;
};

// Builder pages add the canvas and app providers in (app)/layout.tsx; public
// pages (hosted forms, receipt verification) render without them.
const RootLayout = ({ children }: RootLayoutProps) => (
  <html lang="en" suppressHydrationWarning>
    <body
      className={cn(
        sans.variable,
        display.variable,
        mono.variable,
        "font-sans antialiased"
      )}
    >
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        enableSystem={false}
      >
        {children}
        <Toaster />
      </ThemeProvider>
    </body>
  </html>
);

export default RootLayout;
