import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";
import BetaSignupForm from "@/components/marketing/BetaSignupForm";

const betaPerks = [
  "Full Pro access — every feature, no limits",
  "First look at new features before anyone else",
  "Direct line to the team — your feedback shapes what we build",
  "Beta pricing locked in when we go paid",
];

export default function BetaPage() {
  return (
    <div className="min-h-screen bg-bg">
      <Nav />

      <div className="pt-32 pb-20 px-4 sm:px-6 max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary-light text-primary text-xs font-medium rounded-pill px-4 py-2 mb-8">
            <span className="w-2 h-2 bg-primary rounded-full inline-block animate-pulse" />
            Beta spots open
          </div>

          <h1
            className="text-4xl sm:text-5xl text-ink mb-5"
            style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
          >
            Join the Beckett beta
          </h1>
          <p className="text-ink-mid text-lg max-w-xl mx-auto leading-relaxed">
            We&apos;re building Beckett with a small group of early members. Beta
            access is free and includes everything in Pro — no credit card,
            no commitment.
          </p>
        </div>

        <div className="bg-white rounded-card border border-border p-8 mb-10">
          <h2
            className="text-xl text-ink mb-6"
            style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
          >
            What you get
          </h2>
          <ul className="space-y-3 mb-8">
            {betaPerks.map((perk) => (
              <li key={perk} className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-primary flex-shrink-0 mt-0.5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-ink-mid text-sm">{perk}</span>
              </li>
            ))}
          </ul>

          <BetaSignupForm
            source="beta_page"
            buttonLabel="Request beta access"
            placeholder="your@email.com"
          />
          <p className="text-xs text-ink-light mt-3 text-center">
            Free during beta &middot; No credit card &middot; Cancel any time
          </p>
        </div>

        <div className="text-center text-sm text-ink-light">
          <p>
            Already have an account?{" "}
            <a href="/auth/login" className="text-primary hover:underline">
              Sign in
            </a>
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}
