import Image from "next/image";
import Link from "next/link";
import { BECKETT_BOUNDARIES, BECKETT_COACHING_PRINCIPLE } from "@/lib/beckett-boundaries";

const sections = [
  {
    title: "What Beckett reads",
    body: [
      "During beta, Beckett can use Gmail, Slack, and Chrome extension context only when you connect those tools and ask Beckett for coaching, or when you turn on an analysis setting yourself.",
      "For Gmail, Beckett uses read-only access so it can understand email threads and help draft replies. For Slack, Beckett uses connected workspace context so it can understand recent DMs, channels, or threads you ask it to analyze.",
      "Beckett is not meant to read your work communication in the background without your action.",
    ],
  },
  {
    title: "What Beckett stores",
    body: [
      "Beckett stores account details, beta access status, onboarding answers, connection status, usage counts, timestamps, contacts you choose to add, and coaching settings.",
      "Beckett does not store full Gmail or Slack message history by default. For product analytics and CRM, Beckett uses counts, timestamps, connection status, and safe event names, not raw message content.",
      "Beckett may store short summaries or metadata when needed to make the product work, debug beta issues, or remember your preferences.",
    ],
  },
  {
    title: "What Beckett does not do",
    body: [
      "Beckett does not sell your personal data.",
      "Beckett does not use Gmail or Slack content for advertising.",
      "Beckett does not connect to LinkedIn, Google Calendar, Zoom, or Google Meet during beta.",
      "Beckett does not ask for or store your personal Anthropic API key.",
    ],
  },
  {
    title: "Feedback and debugging",
    body: [
      "If you submit beta feedback, that feedback may include the page, rating, your comment, and relevant debug context.",
      "Extension feedback may include message context from the analysis you are reporting, because that helps us understand what went wrong. Only send feedback when you are comfortable sharing that context with the Beckett team.",
      "We use beta feedback to fix bugs, improve coaching quality, and decide what needs to change before inviting more users.",
    ],
  },
  {
    title: "Deletion during beta",
    body: [
      "You can request account deletion from Settings. During beta, deletion is handled manually so we can remove data across Beckett, Supabase, HubSpot, email tools, and related systems.",
      "Beckett currently targets completion within 30 days. If you need help, email hello@meetbeckett.co.",
    ],
  },
];

export const metadata = {
  title: "Privacy and Trust - Beckett",
  description:
    "How Beckett handles Gmail, Slack, extension context, beta feedback, deletion, and coaching boundaries.",
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-bg text-ink">
      <header className="border-b border-border bg-white/80">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="inline-flex items-center gap-3">
            <Image
              src="/brand/beckett-horizontal-logo.png"
              alt="Beckett"
              width={126}
              height={32}
              priority
            />
          </Link>
          <Link
            href="/beta"
            className="rounded-pill bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
          >
            Beta access
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-4xl px-5 py-12">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-primary">
          Privacy and trust
        </p>
        <h1
          className="mb-4 text-4xl text-ink sm:text-5xl"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Beckett should be clear before it asks for context.
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-ink-mid">
          Beckett is a workplace communication coach for beta users. It works best with real
          communication context, so the rules below explain what Beckett reads, what it stores,
          what feedback can include, and where the coaching boundaries are.
        </p>
      </section>

      <section className="mx-auto grid w-full max-w-4xl gap-5 px-5 pb-12">
        {sections.map((section) => (
          <article key={section.title} className="rounded-card border border-border bg-white p-6">
            <h2
              className="mb-3 text-2xl text-ink"
              style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
            >
              {section.title}
            </h2>
            <div className="space-y-3">
              {section.body.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-relaxed text-ink-mid">
                  {paragraph}
                </p>
              ))}
            </div>
          </article>
        ))}

        <article className="rounded-card border border-primary/20 bg-primary-light/60 p-6">
          <h2
            className="mb-3 text-2xl text-ink"
            style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
          >
            Beckett&apos;s coaching boundaries
          </h2>
          <p className="mb-4 text-sm leading-relaxed text-ink-mid">
            {BECKETT_COACHING_PRINCIPLE}
          </p>
          <ul className="space-y-2">
            {BECKETT_BOUNDARIES.map((boundary) => (
              <li key={boundary} className="flex gap-2 text-sm leading-relaxed text-ink-mid">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{boundary}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
