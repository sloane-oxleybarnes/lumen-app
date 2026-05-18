import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";
import BetaSignupForm from "@/components/marketing/BetaSignupForm";
import Link from "next/link";

const featureHighlights = [
  {
    icon: "🔍",
    title: "Message decoder",
    description:
      "Understand the subtext in any message — what someone really means, what they need, and how to respond.",
  },
  {
    icon: "✍️",
    title: "Draft from context",
    description:
      "Write replies that land. Lumen reads the thread and helps you say exactly what you mean, clearly.",
  },
  {
    icon: "🎯",
    title: "Practice mode",
    description:
      "Run through real scenarios in a safe space. Build the confidence to say hard things well.",
  },
];

const platforms = [
  { name: "Gmail", icon: "📧" },
  { name: "Slack", icon: "💬" },
  { name: "Meet", icon: "🎥" },
  { name: "Zoom", icon: "📹" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-bg">
      <Nav />

      {/* Hero */}
      <section className="pt-40 pb-24 px-4 sm:px-6 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-primary-light text-primary text-xs font-medium rounded-pill px-4 py-2 mb-8">
          <span className="w-2 h-2 bg-primary rounded-full inline-block" />
          Now in private beta
        </div>

        <h1
          className="text-5xl sm:text-6xl lg:text-7xl text-ink leading-tight mb-6"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Your personal
          <br />
          communication coach
        </h1>

        <p className="text-lg sm:text-xl text-ink-mid max-w-2xl mx-auto mb-10 leading-relaxed">
          Lumen works alongside you in Gmail, Slack, and meetings — helping you
          decode what people mean, draft replies that land, and build lasting
          communication skills.
        </p>

        <div className="max-w-xl mx-auto">
          <BetaSignupForm source="hero" buttonLabel="Request beta access" />
          <p className="text-xs text-ink-light mt-3">
            Free during beta &middot; No credit card required
          </p>
        </div>
      </section>

      {/* Feature highlights */}
      <section className="py-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2
            className="text-3xl sm:text-4xl text-ink mb-4"
            style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
          >
            Three things Lumen does well
          </h2>
          <p className="text-ink-mid max-w-xl mx-auto">
            Real-time support for the moments that matter most.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {featureHighlights.map((f) => (
            <div
              key={f.title}
              className="bg-white rounded-card border border-border p-7 hover:shadow-sm transition-shadow"
            >
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3
                className="text-lg text-ink mb-2"
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
      </section>

      {/* Platform logos */}
      <section className="py-16 px-4 sm:px-6 bg-white border-y border-border">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm text-ink-light mb-8 uppercase tracking-wide font-medium">
            Works where you work
          </p>
          <div className="flex items-center justify-center gap-8 sm:gap-16 flex-wrap">
            {platforms.map((p) => (
              <div key={p.name} className="flex items-center gap-2 text-ink-mid">
                <span className="text-2xl">{p.icon}</span>
                <span className="text-sm font-medium">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Beta signup section */}
      <section
        id="beta"
        className="py-24 px-4 sm:px-6 max-w-3xl mx-auto text-center"
      >
        <h2
          className="text-3xl sm:text-4xl text-ink mb-4"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Join the beta
        </h2>
        <p className="text-ink-mid mb-10 max-w-lg mx-auto">
          We&apos;re opening Lumen to a small group of early members. Beta
          access includes everything in Pro — free, for as long as you&apos;re
          in the beta.
        </p>
        <div className="max-w-lg mx-auto">
          <BetaSignupForm source="landing_cta" />
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 bg-ink text-white text-center">
        <div className="max-w-2xl mx-auto">
          <h2
            className="text-3xl sm:text-4xl mb-4"
            style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
          >
            Communication is a skill.
            <br />
            Lumen helps you build it.
          </h2>
          <p className="text-white/70 mb-8">
            See every feature, every integration, every skill module.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              href="/features"
              className="bg-white text-ink text-sm font-medium rounded-pill px-6 py-3 hover:bg-primary-light transition-colors"
            >
              See all features
            </Link>
            <Link
              href="/pricing"
              className="border border-white/30 text-white text-sm rounded-pill px-6 py-3 hover:border-white/60 transition-colors"
            >
              View pricing
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
