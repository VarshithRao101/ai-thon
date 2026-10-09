import {
  Sora as createDisplay,
  JetBrains_Mono as createMono,
  Inter as createSans,
} from "next/font/google";

export const sans = createSans({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

export const display = createDisplay({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export const mono = createMono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});
