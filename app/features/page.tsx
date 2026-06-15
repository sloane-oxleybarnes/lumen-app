import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";
import Link from "next/link";
import { contentValue } from "@/lib/site-content";
import { getSiteContent } from "@/lib/site-content-server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Explore Beckett features for neurodivergent workplace communication coaching, including message decoding, drafting, Slack support, practice, and skills.",
  alternates: {
    canonical: "/features",
  },
};

const features = [
  {
    title: "Message decoder",
    description:
      "Understand what someone is really saying — the tone, the subtext, the ask beneath the ask.",
    plan: "free",
    icon: "🔍",
  },
  {
    title: "Draft from context",
    description:
      "Get a draft reply based on the full thread. Adjust tone, length, and style before you send.",
    plan: "free",
    icon: "✍️",
  },
  {
    title: "Tone analysis",
    description:
      "See how your message reads before you hit send — warm, direct, cautious, or something in between.",
    plan: "free",
    icon: "🌡️",
  },
  {
    title: "Safe people mode",
    description:
      "Toggle on for messages to close colleagues or friends — Beckett adjusts its suggestions to match.",
    plan: "free",
    icon: "🛡️",
  },
  {
    title: "Practice mode",
    description:
      "Run through hard conversations in a low-stakes space. Get feedback on what landed and what didn't.",
    plan: "pro",
    icon: "🎯",
  },
  {
    title: "Meeting support",
    description:
      "Google Meet and Zoom coaching are planned after the Gmail and Slack beta flows are stable.",
    plan: "pro",
    icon: "🎥",
  },
  {
    title: "Slack integration",
    description:
      "Decode and draft directly inside Slack. Works on any channel, DM, or thread.",
    plan: "pro",
    icon: "💬",
  },
  {
    title: "LinkedIn messaging",
    description:
      "Professional outreach coaching is on the roadmap after the workplace beta.",
    plan: "pro",
    icon: "💼",
  },
  {
    title: "Skill modules",
    description:
      "Structured coaching on specific communication challenges — from giving feedback to navigating conflict.",
    plan: "pro",
    icon: "📚",
  },
  {
    title: "Course feedback loop",
    description:
      "Beta course feedback helps Beckett learn which coaching moments are actually useful.",
    plan: "pro",
    icon: "📊",
  },
  {
    title: "Beta feedback",
    description:
      "Send course and coaching feedback so Beckett can improve around real beta usage.",
    plan: "pro",
    icon: "📝",
  },
  {
    title: "Beta access tracking",
    description:
      "Beta administration is focused on access approval, feedback review, and setup tracking.",
    plan: "pro",
    icon: "⚙️",
  },
];

const planBadge: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  team: "Team",
};

const planColor: Record<string, string> = {
  free: "bg-green-50 text-green-700 border border-green-200",
  pro: "bg-primary-light text-primary border border-primary/20",
  team: "bg-amber-50 text-amber-700 border border-amber-200",
};

export default async function FeaturesPage() {
  const content = await getSiteContent([
    "features.hero.title",
    "features.hero.subtitle",
    "features.cta.copy",
    "features.cta.button",
  ]);

  return (
    <div className="min-h-screen bg-bg">
      <Nav />

      <div className="pt-32 pb-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h1
            className="text-4xl sm:text-5xl text-ink mb-4"
            style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
          >
            {contentValue(content, "features.hero.title")}
          </h1>
          <p className="text-ink-mid max-w-xl mx-auto text-lg">
            {contentValue(content, "features.hero.subtitle")}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-white rounded-card border border-border p-6 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-2xl" aria-hidden="true">{f.icon}</span>
                <span
                  className={`text-xs font-medium rounded-pill px-2.5 py-0.5 ${planColor[f.plan]}`}
                >
                  {planBadge[f.plan]}
                </span>
              </div>
              <h3
                className="text-base text-ink"
                style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
              >
                {f.title}
              </h3>
              <p className="text-sm text-ink-mid leading-relaxed">
                {f.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <p className="text-ink-mid mb-6">
            {contentValue(content, "features.cta.copy")}
          </p>
          <Link
            href="/beta"
            className="bg-primary text-white rounded-pill px-8 py-3 text-sm font-medium hover:bg-primary-dark transition-colors inline-block"
          >
            {contentValue(content, "features.cta.button")}
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}
