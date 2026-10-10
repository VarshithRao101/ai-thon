import { ReactFlowProvider } from "@xyflow/react";
import { Provider } from "jotai";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/provider";
import { RequireAuth } from "@/components/auth/require-auth";
import { GlobalModals } from "@/components/global-modals";
import { OverlayProvider } from "@/components/overlays/overlay-provider";
import { PersistentCanvas } from "@/components/workflow/persistent-canvas";

// The signed-in app: dashboard and builder (a persistent canvas behind
// /build and /workflows/*). Guests are sent to /login first.
const AppLayout = ({ children }: { children: ReactNode }) => (
  <Provider>
    <AuthProvider>
      <RequireAuth>
      <OverlayProvider>
        <ReactFlowProvider>
          <PersistentCanvas />
          <div className="pointer-events-none relative z-10">{children}</div>
        </ReactFlowProvider>
        <GlobalModals />
      </OverlayProvider>
      </RequireAuth>
    </AuthProvider>
  </Provider>
);

export default AppLayout;
