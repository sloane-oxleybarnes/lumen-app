import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import AnalyticsScripts from "@/components/analytics/AnalyticsScripts";
import StagingBanner from "@/components/StagingBanner";
import { getPublicSiteUrl } from "@/lib/deployment-env";
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
  metadataBase: new URL(getPublicSiteUrl()),
  title: {
    default: "Beckett - Neurodivergent Workplace Communication Coach",
    template: "%s | Beckett",
  },
  description:
    "Beckett is a neurodivergent communication coach for ADHD workplace communication, autism workplace support, clearer replies, and difficult conversations.",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/brand/beckett-favicon.png",
    apple: "/brand/beckett-favicon.png",
  },
  openGraph: {
    title: "Beckett - Neurodivergent Workplace Communication Coach",
    description:
      "Decode Gmail and Slack, draft clearer replies, and practice difficult workplace conversations with Beckett.",
    url: "/",
    siteName: "Beckett",
    images: [
      {
        url: "/brand/beckett-og.png",
        width: 1200,
        height: 630,
        alt: "Beckett workplace communication coach",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Beckett - Neurodivergent Workplace Communication Coach",
    description:
      "Workplace communication coaching for neurodivergent professionals in Gmail, Slack, and practice sessions.",
    images: ["/brand/beckett-og.png"],
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
        <StagingBanner />
        {children}
      </body>
    </html>
  );
}
