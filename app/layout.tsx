import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import AnalyticsScripts from "@/components/analytics/AnalyticsScripts";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-dm-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Beckett — Your workplace communication coach",
  description:
    "Beckett helps neurodivergent professionals decode workplace tone, draft clearer replies, and practice hard conversations.",
  icons: {
    icon: "/brand/beckett-favicon.png",
    apple: "/brand/beckett-favicon.png",
  },
  openGraph: {
    title: "Beckett — Your workplace communication coach",
    description:
      "Beckett helps neurodivergent professionals decode workplace tone, draft clearer replies, and practice hard conversations.",
    siteName: "Beckett",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmSerif.variable}`}>
      <body className="bg-bg text-ink antialiased" style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
        <AnalyticsScripts />
        {children}
      </body>
    </html>
  );
}
