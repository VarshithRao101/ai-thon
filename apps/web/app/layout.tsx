import type { Metadata, Viewport } from "next";
import "./globals.css";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { display, mono, sans } from "@/lib/fonts";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: {
    default: "ZETA | Automate anything. Prove everything.",
    template: "%s | ZETA",
  },
  description:
    "AI-powered no-code automation. Describe a workflow in plain English and ZETA builds and runs it across forms, Google Sheets, Gmail and Telegram.",
  applicationName: "ZETA",
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
// pages (hosted forms, legal) render without them.
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
