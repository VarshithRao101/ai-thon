import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: { absolute: "N-Flow | Automate anything. Just say it." },
  description:
    "Describe an automation in plain English. N-Flow builds it across forms, Google Sheets, Gmail and Telegram, and runs it.",
};

export default function Home() {
  return <LandingPage />;
}
