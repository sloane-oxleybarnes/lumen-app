import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";
import Link from "next/link";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "The essentials to get started with clearer communication.",
    cta: "Get started",
    href: "/auth/signup",
    highlight: false,
    features: [
      "Message decoder in Gmail",
      "Draft from context (10/month)",
      "Tone analysis",
      "Safe people mode",
      "Chrome extension",
    ],
    notIncluded: [
      "Meeting guidance",
      "Slack integration",
      "Practice mode",
      "Skill modules",
      "Weekly digest",
    ],
  },
  {
    name: "Pro",
    price: "$12",
    period: "per month",
    description: "Everything you need to build lasting communication skills.",
    cta: "Join the beta — get Pro free",
    href: "/beta",
    highlight: true,
    features: [
      "Everything in Free",
      "Unlimited drafts",
      "Meeting guidance (Meet + Zoom)",
      "Slack integration",
      "LinkedIn messaging",
      "Practice mode",
      "All 6 skill modules",
      "Weekly coaching digest",
    ],
    notIncluded: [],
  },
  {
    name: "Team",
    price: "Custom",
    period: "per team",
    description: "For managers who want to support their team's communication.",
    cta: "Contact us",
    href: "mailto:sloane@meetlumen.ai",
    highlight: false,
    features: [
      "Everything in Pro for each member",
      "Team admin dashboard",
      "Seat management",
      "Aggregated team insights",
      "Data sharing controls",
      "Priority support",
      "Onboarding call",
    ],
    notIncluded: [],
  },
];

const checkIcon = (
  <svg className="w-4 h-4 text-green-600 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);

const xIcon = (
  <svg className="w-4 h-4 text-ink-light flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
);

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-bg">
      <Nav />

      <div className="pt-32 pb-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h1
            className="text-4xl sm:text-5xl text-ink mb-4"
            style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
          >
            Simple, honest pricing
          </h1>
          <p className="text-ink-mid max-w-xl mx-auto text-lg">
            Start free. Upgrade when you need more. Beta members get Pro free
            for as long as they&apos;re in the beta.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-start">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-card border p-8 flex flex-col ${
                plan.highlight
                  ? "bg-primary border-primary shadow-lg shadow-primary/10"
                  : "bg-white border-border"
              }`}
            >
              <div className="mb-6">
                <h2
                  className={`text-xl mb-1 ${plan.highlight ? "text-white" : "text-ink"}`}
                  style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
                >
                  {plan.name}
                </h2>
                <div className="flex items-baseline gap-1 mb-2">
                  <span
                    className={`text-4xl font-semibold ${plan.highlight ? "text-white" : "text-ink"}`}
                  >
                    {plan.price}
                  </span>
                  <span className={`text-sm ${plan.highlight ? "text-white/70" : "text-ink-light"}`}>
                    /{plan.period}
                  </span>
                </div>
                <p className={`text-sm ${plan.highlight ? "text-white/80" : "text-ink-mid"}`}>
                  {plan.description}
                </p>
              </div>

              <ul className="space-y-2.5 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    {plan.highlight ? (
                      <svg className="w-4 h-4 text-white flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : checkIcon}
                    <span className={`text-sm ${plan.highlight ? "text-white/90" : "text-ink-mid"}`}>
                      {f}
                    </span>
                  </li>
                ))}
                {plan.notIncluded.map((f) => (
                  <li key={f} className="flex items-start gap-2 opacity-40">
                    {xIcon}
                    <span className="text-sm text-ink-mid">{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`text-center rounded-pill py-3 text-sm font-medium transition-colors ${
                  plan.highlight
                    ? "bg-white text-primary hover:bg-primary-light"
                    : "bg-primary text-white hover:bg-primary-dark"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-ink-light mt-10">
          All plans include a 14-day free trial. No credit card required to
          start.
        </p>
      </div>

      <Footer />
    </div>
  );
}
