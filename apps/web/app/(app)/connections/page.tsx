import type { Metadata } from "next";
import { ConnectionsPage } from "@/components/connections/connections-page";

export const metadata: Metadata = { title: "Connections" };

export default function Page() {
  return <ConnectionsPage />;
}
