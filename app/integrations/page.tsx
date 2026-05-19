import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";
import Link from "next/link";

const live = [
  { name: "Gmail", icon: "📧", description: "Decode and draft in any Gmail thread." },
  { name: "Slack", icon: "💬", description: "Inline support in channels, DMs, and threads." },
  { name: "Google Meet", icon: "🎥", description: "Real-time meeting guidance as you speak." },
  { name: "Zoom", icon: "📹", description: "Prompts and support during Zoom calls." },
];

const comingSoon = [
  { name: "Microsoft Teams", icon: "🏢" },
  { name: "Outlook", icon: "📨" },
  { name: "LinkedIn Messaging", icon: "💼" },
  { name: "Notion", icon: "📝" },
  { name: "Loom", icon: "🎬" },
  { name: "Performance reviews", icon: "📋" },
  { name: "Discord", icon: "🎮" },
  { name: "Calendar", icon: "📅" },
];

export default function IntegrationsPage() {
  return (
    <div className="min-h-screen bg-bg">
      <Nav />

      <div className="pt-32 pb-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h1
            className="text-4xl sm:text-5xl text-ink mb-4"
            style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
          >
            Works where you work
          </h1>
          <p className="text-ink-mid max-w-xl mx-auto text-lg">
            Beckett runs in the tools you already use — no new apps, no workflow
            changes.
          </p>
        </div>

        <h2
          className="text-xl text-ink mb-6"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Live integrations
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-16">
          {live.map((item) => (
            <div
              key={item.name}
              className="bg-white rounded-card border border-border p-6"
            >
              <div className="text-3xl mb-3">{item.icon}</div>
              <h3
                className="text-base text-ink mb-1"
                style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
              >
                {item.name}
              </h3>
              <p className="text-sm text-ink-mid">{item.description}</p>
              <div className="mt-4">
                <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-pill px-2.5 py-0.5">
                  Live
                </span>
              </div>
            </div>
          ))}
        </div>

        <h2
          className="text-xl text-ink mb-6"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Coming soon
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {comingSoon.map((item) => (
            <div
              key={item.name}
              className="bg-white rounded-card border border-border p-5 flex items-center gap-3 opacity-70"
            >
              <span className="text-2xl">{item.icon}</span>
              <span className="text-sm text-ink-mid font-medium">{item.name}</span>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <p className="text-ink-mid mb-6">
            Want to request an integration? Let us know when you join the beta.
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
