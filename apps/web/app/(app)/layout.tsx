import { ReactFlowProvider } from "@xyflow/react";
import { Provider } from "jotai";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/provider";
import { GlobalModals } from "@/components/global-modals";
import { OverlayProvider } from "@/components/overlays/overlay-provider";
import { PersistentCanvas } from "@/components/workflow/persistent-canvas";

// The builder: a persistent workflow canvas behind every page in this group.
const AppLayout = ({ children }: { children: ReactNode }) => (
  <Provider>
    <AuthProvider>
      <OverlayProvider>
        <ReactFlowProvider>
          <PersistentCanvas />
          <div className="pointer-events-none relative z-10">{children}</div>
        </ReactFlowProvider>
        <GlobalModals />
      </OverlayProvider>
    </AuthProvider>
  </Provider>
);

export default AppLayout;
