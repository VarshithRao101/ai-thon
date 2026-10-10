import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: { absolute: "N-Flow | Automate anything. Prove everything." },
  description:
    "Describe an automation in plain English. N-Flow builds it across forms, Google Sheets, Gmail and Telegram, runs it, and anchors a verifiable receipt for every run on Polygon.",
};

export default function Home() {
  return <LandingPage />;
}
