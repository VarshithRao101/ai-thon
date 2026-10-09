import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ReactFlowProvider } from "@xyflow/react";
import { Provider } from "jotai";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/provider";
import { GlobalModals } from "@/components/global-modals";
import { OverlayProvider } from "@/components/overlays/overlay-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { PersistentCanvas } from "@/components/workflow/persistent-canvas";
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
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

type RootLayoutProps = {
  children: ReactNode;
};

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
        <Provider>
          <AuthProvider>
            <OverlayProvider>
              <ReactFlowProvider>
                <PersistentCanvas />
                <div className="pointer-events-none relative z-10">
                  {children}
                </div>
              </ReactFlowProvider>
              <Toaster />
              <GlobalModals />
            </OverlayProvider>
          </AuthProvider>
        </Provider>
      </ThemeProvider>
    </body>
  </html>
);

export default RootLayout;
