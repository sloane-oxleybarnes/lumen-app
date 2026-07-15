import Image from "next/image";
import Link from "next/link";

const sections = [
  {
    title: "Who may use Beckett",
    body: [
      "Beckett is currently offered as an invite-only beta to people who are at least 18 years old and located in the United States. You must provide accurate account information and keep your login credentials secure.",
      "Beckett Labs Inc may approve, limit, suspend, or end beta access at any time, including to protect users, the service, or connected platforms.",
    ],
  },
  {
    title: "What Beckett provides",
    body: [
      "Beckett is an AI-assisted communication coaching tool. It can help you examine messages, draft responses, prepare for conversations, practice communication, and build skills.",
      "AI responses may be incomplete, inaccurate, or inappropriate for your circumstances. Beckett cannot know another person's hidden intent, feelings, or future actions. You are responsible for reviewing suggestions and deciding what to send or do.",
    ],
  },
  {
    title: "Coaching, not professional advice",
    body: [
      "Beckett is not medical, mental-health, legal, financial, human-resources, or employment advice, and it is not a substitute for a qualified professional. Beckett does not diagnose any person or determine whether workplace conduct is lawful.",
      "If a situation involves immediate danger, harassment, discrimination, retaliation, a legal deadline, or a health crisis, contact an appropriate professional, emergency service, or trusted workplace resource instead of relying on Beckett alone.",
    ],
  },
  {
    title: "Beta access and limits",
    body: [
      "The beta is free and may include usage limits, temporary outages, changing features, and unfinished functionality. Beta limits and features may change as Beckett learns from testing. Only successful user-visible AI responses count toward stated coaching limits.",
      "Future Free, Pro, or Team offerings may differ from the beta. Beckett will show the applicable terms and price before charging for a paid service.",
    ],
  },
  {
    title: "Connected services",
    body: [
      "If you connect Gmail, Slack, Chrome, or another service, you authorize Beckett to use the access you approve only to provide the requested features. Your use of those services remains subject to their own terms and policies.",
      "You may disconnect integrations from Beckett or the connected provider. Some features will stop working after disconnection.",
    ],
  },
  {
    title: "Acceptable use",
    body: [
      "Do not use Beckett to harass, threaten, deceive, impersonate, discriminate, violate privacy, expose confidential information without authorization, break the law, or interfere with the service. Do not attempt to bypass access controls, usage limits, or security protections.",
      "Only submit workplace or personal communication that you are permitted to use. You retain responsibility for your content and for messages you choose to send.",
    ],
  },
  {
    title: "Privacy and feedback",
    body: [
      "Beckett's Privacy Policy explains what data is used, stored, and shared. If you submit beta feedback, Beckett Labs Inc may use it to test, repair, and improve the product. Do not include information in feedback that you are not comfortable sharing with the Beckett team.",
    ],
  },
  {
    title: "Ownership",
    body: [
      "Beckett Labs Inc owns Beckett, its software, branding, and product materials. You keep ownership of content you submit. You give Beckett a limited permission to process that content only as needed to operate, secure, support, and improve the service as described in these Terms and the Privacy Policy.",
    ],
  },
  {
    title: "Disclaimers and liability",
    body: [
      "The beta is provided on an 'as is' and 'as available' basis to the fullest extent permitted by law. Beckett Labs Inc does not promise that the service will always be available, error-free, or suitable for a particular result.",
      "To the fullest extent permitted by law, Beckett Labs Inc is not liable for indirect, incidental, special, consequential, or punitive damages arising from use of the beta. Nothing in these Terms limits rights or liability that cannot legally be limited.",
    ],
  },
  {
    title: "Changes and governing law",
    body: [
      "Beckett may update these Terms as the beta changes. Material updates will be posted here with a new effective date. Continuing to use Beckett after an update means you accept the updated Terms.",
      "These Terms are governed by Delaware law, without regard to conflict-of-law rules, while preserving any mandatory consumer rights that apply where you live. Beckett Labs Inc is incorporated in Delaware and operates from California.",
    ],
  },
];

export const metadata = {
  title: "Terms of Use - Beckett",
  description: "Terms for using the Beckett invite-only communication coaching beta.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-bg text-ink">
      <header className="border-b border-border bg-white/80">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/">
            <Image src="/brand/beckett-horizontal-logo.png" alt="Beckett" width={126} height={32} priority />
          </Link>
          <Link href="/beta" className="rounded-pill bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
            Request beta access
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-4xl px-5 py-12">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-primary">Terms of use</p>
        <h1 className="mb-4 text-4xl text-ink sm:text-5xl" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>
          Clear expectations for using Beckett.
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-ink-mid">
          These Terms govern your use of the Beckett beta operated by Beckett Labs Inc. By creating or using an account, you agree to them.
        </p>
        <p className="mt-4 text-sm text-ink-light">Effective: July 14, 2026</p>
      </section>

      <section className="mx-auto grid w-full max-w-4xl gap-5 px-5 pb-12">
        {sections.map((section) => (
          <article key={section.title} className="rounded-card border border-border bg-white p-6">
            <h2 className="mb-3 text-2xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>{section.title}</h2>
            <div className="space-y-3">
              {section.body.map((paragraph) => <p key={paragraph} className="text-sm leading-relaxed text-ink-mid">{paragraph}</p>)}
            </div>
          </article>
        ))}
        <article className="rounded-card border border-primary/20 bg-primary-light/60 p-6">
          <h2 className="mb-3 text-2xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>Contact</h2>
          <p className="text-sm leading-relaxed text-ink-mid">
            Questions about these Terms can be sent to <a className="text-primary hover:underline" href="mailto:hello@meetbeckett.co">hello@meetbeckett.co</a>. Read the <Link className="text-primary hover:underline" href="/privacy">Privacy Policy</Link> for more about data handling.
          </p>
        </article>
      </section>
    </main>
  );
}
