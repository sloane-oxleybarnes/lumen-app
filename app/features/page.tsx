import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";
import Link from "next/link";

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
    title: "Meeting guidance",
    description:
      "Real-time prompts during Google Meet and Zoom calls — when to speak, how to frame your point.",
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
      "Professional outreach and responses that sound human, not templated.",
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
    title: "Weekly coaching digest",
    description:
      "A weekly summary of patterns in your communication and concrete things to try.",
    plan: "pro",
    icon: "📊",
  },
  {
    title: "Team insights",
    description:
      "Aggregated, anonymised team communication health — for managers who want to support, not surveil.",
    plan: "team",
    icon: "👥",
  },
  {
    title: "Admin dashboard",
    description:
      "Manage seats, review team usage, and control data sharing settings across your team.",
    plan: "team",
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

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-bg">
      <Nav />

      <div className="pt-32 pb-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h1
            className="text-4xl sm:text-5xl text-ink mb-4"
            style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
          >
            Everything Beckett can do
          </h1>
          <p className="text-ink-mid max-w-xl mx-auto text-lg">
            12 features built around one goal: helping you communicate with
            more clarity and confidence.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-white rounded-card border border-border p-6 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-2xl">{f.icon}</span>
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
            Want all of it? Join the beta for full Pro access, free.
          </p>
          <Link
            href="/beta"
            className="bg-primary text-white rounded-pill px-8 py-3 text-sm font-medium hover:bg-primary-dark transition-colors inline-block"
          >
            Join the beta
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}
