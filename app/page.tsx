"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { SITE_CONTENT_DEFAULTS, contentValue } from "@/lib/site-content";
import "./home.css";

type Mode = "personal" | "professional";

export default function HomePage() {
  const [mode, setMode] = useState<Mode>("professional");
  const [betaEmail, setBetaEmail] = useState("");
  const [betaStatus, setBetaStatus] = useState<"idle" | "loading" | "done">("idle");
  const [activeSection, setActiveSection] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [siteContent, setSiteContent] = useState<Record<string, string>>(SITE_CONTENT_DEFAULTS);
  const router = useRouter();
  const copy = (key: string) => contentValue(siteContent, key);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("error=")) {
      const params = new URLSearchParams(hash.substring(1));
      const errorDesc = params.get("error_description");
      if (errorDesc) router.push(`/auth/signin?error=${encodeURIComponent(errorDesc)}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sections = ["features", "triggers", "skills", "beta"];
    function onScroll() {
      let current = "";
      sections.forEach((id) => {
        const el = document.getElementById(id);
        if (el && window.scrollY >= el.offsetTop - 120) current = id;
      });
      setActiveSection(current);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/site-content")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.content) setSiteContent(data.content);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitBeta(e: React.FormEvent) {
    e.preventDefault();
    setBetaStatus("loading");
    try {
      await fetch("/api/beta-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: betaEmail, plan: "beta", source: "landing_page" }),
      });
    } catch {}
    setBetaStatus("done");
  }

  const features = [
    {
      n: "01",
      title: "Message decoder",
      personal: "What did they actually mean? Beckett reads ambiguous texts, DMs, and messages and explains what's really going on — the tone, the subtext, what they actually need from you.",
      professional: "Beckett reads your Gmail and Slack and explains what's really happening beneath the surface — the subtext, the power dynamics, what the person actually needs from you.",
      action: "Decode this message →",
    },
    {
      n: "02",
      title: "Conversation practice",
      personal: "Practice asking someone out, telling a friend something hard, or navigating a difficult family conversation — with Beckett playing the other person realistically, including the pushback.",
      professional: "Practice asking for a raise, addressing a coworker who's taking credit for your work, or holding your ground in a meeting — before the real thing happens.",
      action: "Practice this conversation →",
    },
    {
      n: "03",
      title: "Skill scenarios",
      personal: "Structured coaching for real situations. Small talk. Dating. Setting limits with family. Beckett walks you through what to say and practices with you until it feels natural.",
      professional: "Structured coaching for workplace situations. Feedback. Salary conversations. Handling passive aggression. Beckett walks you through each one.",
      action: "Start a scenario →",
    },
    {
      n: "04",
      title: "Coached next steps",
      personal: "Personal coaching is in preview through practice and the dating course. Phone and social integrations are coming later.",
      professional: "Beckett helps you decide what to say next in Gmail, Slack, and practice sessions. Meeting support is coming after beta testing.",
      action: "See how it works →",
    },
    {
      n: "05",
      title: "Safe people mode",
      personal: "Toggle on for people you fully trust. Beckett completely relaxes — no coaching layer, just warmth. Because some relationships don't need a buffer.",
      professional: "Toggle on for close colleagues and trusted managers. Beckett steps back and lets you communicate naturally — no professional filter required.",
      action: "",
    },
  ];

  const personalScenarios = [
    { diff: "d-med", label: "Medium stakes", situation: "You matched with someone on Hinge. They sent a message. You want to respond but have no idea what to say.", action: "Practice this conversation →" },
    { diff: "d-low", label: "Low stakes", situation: "Someone at a party just walked up to you and you have no idea how to make small talk.", action: "Start this scenario →" },
    { diff: "d-med", label: "Medium stakes", situation: "Your friend keeps canceling plans and you need to say something without blowing up the friendship.", action: "Practice this conversation →" },
    { diff: "d-med", label: "Medium stakes", situation: "You like someone and want to ask them out but you don't know how to read the signals.", action: "Decode the signals →" },
    { diff: "d-high", label: "High stakes", situation: "You need to tell your family you can't make it to the holidays this year.", action: "Practice this conversation →" },
    { diff: "d-low", label: "Low stakes", situation: "You want to reconnect with an old friend you've lost touch with but don't know how to start.", action: "Start this scenario →" },
  ];

  const professionalScenarios = [
    { diff: "d-med", label: "Medium stakes", situation: "Your manager gave you vague feedback and you're not sure if you're actually in trouble.", action: "Decode this message →" },
    { diff: "d-high", label: "High stakes", situation: "A coworker keeps taking credit for your work in meetings and you need to address it.", action: "Practice this conversation →" },
    { diff: "d-high", label: "High stakes", situation: "You want to ask for a raise but don't know how to start the conversation.", action: "Practice this conversation →" },
    { diff: "d-med", label: "Medium stakes", situation: "Your team is pushing back on your idea and you need to hold your ground without getting defensive.", action: "Practice this conversation →" },
    { diff: "d-med", label: "Medium stakes", situation: "A client sent an email that seems passive-aggressive and you can't tell if you're reading it wrong.", action: "Decode this message →" },
    { diff: "d-low", label: "Low stakes", situation: "You need to give constructive feedback to a colleague without making it awkward.", action: "Start this scenario →" },
  ];

  const triggers = [
    { label: "I always over-explain and apologize too much", beckett: "Flags when you're over-qualifying and helps you land the point directly." },
    { label: "I can't tell when someone is being sarcastic vs. serious", beckett: "Decodes tone and tells you plainly what's actually going on." },
    { label: "I freeze when conflict feels imminent", beckett: "Coaches you in the moment — what to say when you're drawing a blank." },
    { label: "I say yes when I mean no and don't know how to stop", beckett: "Helps you practice setting limits before the conversation happens." },
  ];

  const professionalTriggers = [
    { label: "I go blank in meetings and lose what I was about to say", beckett: "Helps you prepare talking points so you're never starting from scratch in the room." },
    { label: "I can't tell if a Slack message is passive-aggressive or just blunt", beckett: "Decodes workplace tone and tells you plainly what's actually behind the message." },
    { label: "I overthink every email for too long before I can hit send", beckett: "Drafts a response you can adjust rather than writing from a blank page." },
    { label: "I shut down when I receive critical feedback, even if it's fair", beckett: "Helps you process and respond when you're not still in the moment." },
  ];

  const personalTestimonials = [
    { av: "qa1", initials: "SR", name: "Sam R.", role: "Freelance designer", quote: "I've always struggled to read texts — is this person annoyed? Joking? Interested? Beckett just tells me. It sounds small but it changes everything." },
    { av: "qa2", initials: "JM", name: "Jordan M.", role: "Graduate student", quote: "I used to rehearse conversations in my head for days before having them. With Beckett I can actually practice and show up ready." },
    { av: "qa3", initials: "CL", name: "Casey L.", role: "Teacher", quote: "Dating felt impossible — I never knew if someone liked me or was just being friendly. Beckett helps me decode what's actually going on." },
  ];

  const professionalTestimonials = [
    { av: "qa1", initials: "AK", name: "Alex K.", role: "Software Engineer", quote: "I always knew what I wanted to say in meetings — getting it out clearly was the hard part. Beckett helps me prepare." },
    { av: "qa2", initials: "MR", name: "Morgan R.", role: "Product Manager", quote: "The live meeting guidance changed everything. I can finally be present instead of replaying everything two hours later." },
    { av: "qa3", initials: "JT", name: "Jamie T.", role: "Customer Success", quote: "I used to rewrite every work email three times and still wasn't sure it landed. Beckett handles that for me." },
  ];

  const scenarios = mode === "personal" ? personalScenarios : professionalScenarios;
  const heroTitleLines = copy("home.hero.title").split("\n").filter(Boolean);
  const betaTitleLines = copy("home.beta.title").split("\n").filter(Boolean);

  return (
    <div className="lumen-home">

      {/* NAV */}
      <nav className="hn-nav">
        <a href="#" className="nav-logo nav-logo-img">
          <Image src="/brand/beckett-horizontal-logo.png" alt="Beckett" width={132} height={33} priority />
        </a>
        <div className="mode-toggle">
          <button
            className={`mt-btn${mode === "personal" ? " mt-on" : ""}`}
            onClick={() => setMode("personal")}
          >
            Personal
          </button>
          <button
            className={`mt-btn${mode === "professional" ? " mt-on" : ""}`}
            onClick={() => setMode("professional")}
          >
            Professional
          </button>
        </div>
        <div className="nav-right">
          <div className="nav-links">
            <a href="#features" className={activeSection === "features" ? "active" : ""}>Features</a>
            <a href="#skills" className={activeSection === "skills" ? "active" : ""}>Scenarios</a>
            <a href="/auth/signin" className="nav-signin">Sign in</a>
          </div>
          <a href="#beta" className="nav-cta">Join the beta →</a>
          <button
            className="nav-hamburger"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="homepage-mobile-navigation"
          >
            {mobileMenuOpen ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        </div>
        {mobileMenuOpen && (
          <div id="homepage-mobile-navigation" className="nav-mobile-menu">
            <a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#skills" onClick={() => setMobileMenuOpen(false)}>Scenarios</a>
            <a href="/auth/signin">Sign in</a>
            <a href="#beta" className="nav-cta-mobile" onClick={() => setMobileMenuOpen(false)}>Join the beta →</a>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="beta-badge">
          <span className="bb-dot" aria-hidden="true" />
          {copy("home.hero.badge")}
        </div>
        <h1>
          {heroTitleLines[0]}
          {heroTitleLines.slice(1).map((line) => (
            <span key={line}>
              <br />
              <em>{line}</em>
            </span>
          ))}
        </h1>
        <p className="hero-sub">
          {copy("home.hero.subtitle")}
        </p>
        <div className="hero-actions">
          <a href="#beta" className="btn-primary">{copy("home.hero.cta")}</a>
        </div>

        {/* Hero visual — phone for personal, browser for professional */}
        <div className="hero-visual">
          {mode === "personal" ? (

            /* ── PHONE MOCKUP ── */
            <div className="phone-frame">
              <div className="phone-notch" />
              <div className="phone-screen">
                <div className="ph-header">
                  <div className="ph-av-wrap">
                    <div className="ph-avatar">A</div>
                    <span className="ph-online" />
                  </div>
                  <div className="ph-name">Alex</div>
                  <div className="ph-meta">Hinge match · online now</div>
                </div>
                <div className="ph-thread">
                  <div className="ph-bubble">haha yeah that&apos;s so funny</div>
                  <div className="ph-bubble">anyway what are you up to this weekend</div>
                </div>
                <div className="ph-beckett">
                  <div className="ph-b-label">What&apos;s happening</div>
                  <div className="ph-b-text">They&apos;re being casual but leaving the door open — a soft invitation. They want to see if you&apos;ll make a move.</div>
                  <div className="ph-replies">
                    <div className="ph-reply">
                      <span className="ph-reply-tag">Direct</span>
                      Actually free Saturday — want to grab coffee?
                    </div>
                    <div className="ph-reply">
                      <span className="ph-reply-tag ph-reply-tag-play">Playful</span>
                      Not much planned yet, might be up for something 👀
                    </div>
                  </div>
                </div>
              </div>
              <div className="phone-home-bar" />
            </div>

          ) : (

            /* ── BROWSER MOCKUP ── */
            <div className="browser-frame">
              <div className="browser-chrome">
                <div className="b-dots">
                  <span className="dot-r" />
                  <span className="dot-y" />
                  <span className="dot-g" />
                </div>
                <div className="b-url">mail.google.com — Inbox</div>
              </div>
              <div className="browser-body">
                <div className="email-pane">
                  <div className="e-from">Sarah Chen · Director of Product</div>
                  <div className="e-subject">Re: Q3 roadmap alignment</div>
                  <div className="e-date">Today at 2:14 PM</div>
                  <div className="e-body">
                    <p>Per my last email, I wanted to make sure we&apos;re on the same page before the all-hands.</p>
                    <div className="e-highlight">&ldquo;Let&apos;s make sure decisions like this go through the right channels going forward.&rdquo;</div>
                    <p>Looking forward to syncing on this.</p>
                  </div>
                </div>
                <div className="b-sidebar">
                  <div className="b-header">
                    <div className="b-logo"><div className="b-dot" />beckett</div>
                    <div className="m-pills">
                      <div className="m-pill">Personal</div>
                      <div className="m-pill on">Work</div>
                    </div>
                  </div>
                  <div className="i-card">
                    <div className="i-label">What&apos;s really going on</div>
                    <div className="i-text">Sarah is signaling frustration that you bypassed her — a soft correction, not open conflict.</div>
                  </div>
                  <div className="i-card">
                    <div className="i-label">What she needs</div>
                    <div className="i-text">Calm acknowledgment that you understand the process and won&apos;t bypass it again.</div>
                  </div>
                  <div className="r-section-label">Draft responses</div>
                  <div className="r-card">
                    <div className="r-tag t-warm">Warm</div>
                    <div className="r-text">Appreciate the note, Sarah. Happy to sync before the all-hands — want to make sure we&apos;re fully aligned.</div>
                    <div className="r-copy"><button type="button" tabIndex={-1} aria-hidden="true">Copy</button></div>
                  </div>
                  <div className="r-card">
                    <div className="r-tag t-direct">Direct</div>
                    <div className="r-text">Thanks for flagging — I&apos;ll loop you in before moving forward on decisions like this.</div>
                    <div className="r-copy"><button type="button" tabIndex={-1} aria-hidden="true">Copy</button></div>
                  </div>
                  <button className="ins-btn" type="button" tabIndex={-1} aria-hidden="true">↗ Insert into Gmail</button>
                </div>
              </div>
            </div>

          )}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features">
        <div className="container">
          <div className="sec-label">What Beckett does</div>
          <h2>Five things that actually<br /><em>make a difference.</em></h2>
          <div className="feat-grid feat-grid-5">
            {features.map((f) => (
              <div key={f.n} className="feat-card">
                <div className="feat-num">{f.n}</div>
                <div className="feat-title">{f.title}</div>
                <div className="feat-text">{mode === "personal" ? f.personal : f.professional}</div>
                {f.action && <div className="feat-action">{f.action}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRIGGERS */}
      <section className="triggers-section" id="triggers">
        <div className="container">
          <div className="sec-label">Your brain, your rules</div>
          <h2>Everyone&apos;s brain has<br /><em>its own patterns.</em></h2>
          <p className="sec-sub">Maybe you overthink every reply. Maybe you miss tone completely. Maybe you go silent when you&apos;re overwhelmed. Beckett doesn&apos;t give you a generic script — it learns what you need and meets you there.</p>
          <div className="trigger-grid">
            {(mode === "personal" ? triggers : professionalTriggers).map((t) => (
              <div key={t.label} className="trigger-card">
                <div className="tc-quote">&ldquo;{t.label}&rdquo;</div>
                <div className="tc-response">{t.beckett}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* APPS — personal preview | professional work platforms */}
      {mode === "personal" ? (
        <div className="apps-wrap">
          <div className="container">
            <div className="sec-label">Personal Preview</div>
            <h2>Personal coaching is<br /><em>coming carefully.</em></h2>
            <p className="sec-sub">For beta, Beckett is workplace-first. Personal mode stays available for practice and the dating course preview while phone, DM, and dating-app integrations come later.</p>
            <div className="apps-grid">
              {[
                { icon: "🎓", name: "Dating course preview" },
                { icon: "🎭", name: "Personal practice" },
                { icon: "💬", name: "Phone + DMs coming soon" },
                { icon: "🌸", name: "Dating app support coming soon" },
              ].map((a) => (
                <div key={a.name} className="app-pill">
                  <span className="app-icon">{a.icon}</span>
                  <span className="app-name">{a.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="plat-wrap">
          <div className="container">
            <div className="sec-label">Platforms</div>
            <h2>Your coach lives<br /><em>inside every app.</em></h2>
            <p className="sec-sub">For beta, Beckett focuses on Gmail, Slack, the Chrome extension, courses, and practice. Meeting support is next, but not live yet.</p>
            <div className="plat-grid">
              {[
                { icon: "pi-gmail", letter: "G", name: "Gmail", desc: "Reads full inbox threads. One click to insert a coached reply into your compose window." },
                { icon: "pi-slack", letter: "S", name: "Slack", desc: "Reads DMs and channels in real time. Inserts coached replies directly into Slack." },
                { icon: "pi-meet", letter: "C", name: "Chrome extension", desc: "Brings Beckett into the workplace tools beta users are testing now." },
                { icon: "pi-zoom", letter: "M", name: "Meetings", desc: "Google Meet and Zoom support are planned after the core beta flows are stable.", soon: true },
              ].map((p) => (
                <div key={p.name} className="plat-card">
                  <div className={`plat-icon ${p.icon}`}>{p.letter}</div>
                  <div className="plat-name">{p.name}</div>
                  <div className="plat-desc">{p.desc}</div>
                  <div className="plat-live">{p.soon ? "Coming soon" : "Live"}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SKILLS */}
      <section id="skills">
        <div className="container">
          <div className="sec-label">Skill scenarios</div>
          <h2>Practice the conversations<br />that actually <em>matter.</em></h2>
          <p className="sec-sub">
            {mode === "personal"
              ? "The real ones. Not hypotheticals — situations you actually find yourself in. Beckett plays the other person realistically and debriefs you on what worked."
              : "The high-stakes ones. The conversations most people wing because they've never actually practiced them. Beckett walks you through each one."}
          </p>
          <div className="skills-grid">
            {scenarios.map((s) => (
              <div key={s.situation} className="skill-card">
                <div className={`sk-diff ${s.diff}`}>{s.label}</div>
                <div className="sk-situation">&ldquo;{s.situation}&rdquo;</div>
                <div className="sk-action">{s.action}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section>
        <div className="container">
          <div className="sec-label">What people say</div>
          <h2>People who think differently<br />and <em>communicate brilliantly.</em></h2>
          <div className="quote-grid">
            {(mode === "personal" ? personalTestimonials : professionalTestimonials).map((q) => (
              <div key={q.name} className="q-card">
                <div className="q-text">&ldquo;{q.quote}&rdquo;</div>
                <div className="q-author">
                  <div className={`q-av ${q.av}`}>{q.initials}</div>
                  <div>
                    <div className="q-name">{q.name}</div>
                    <div className="q-role">{q.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BETA */}
      <div className="beta-wrap" id="beta">
        <div className="container">
          <div className="sec-label">{copy("home.beta.label")}</div>
          <h2>
            {betaTitleLines[0]}
            {betaTitleLines.slice(1).map((line) => (
              <span key={line}>
                <br />
                <em>{line}</em>
              </span>
            ))}
          </h2>
          <p className="sec-sub">{copy("home.beta.subtitle")}</p>
          {betaStatus === "done" ? (
            <p className="beta-ok">You&apos;re on the list. We&apos;ll be in touch. ✓</p>
          ) : (
            <form className="beta-form" onSubmit={submitBeta}>
              <label className="sr-only" htmlFor="homepage-beta-email">Email for beta access</label>
              <input
                id="homepage-beta-email"
                className="beta-input"
                type="email"
                placeholder="your@email.com"
                required
                value={betaEmail}
                onChange={(e) => setBetaEmail(e.target.value)}
              />
              <button className="beta-btn" type="submit" disabled={betaStatus === "loading"}>
                {betaStatus === "loading" ? "Sending..." : copy("home.beta.button")}
              </button>
            </form>
          )}
          <p className="beta-note">{copy("home.beta.note")}</p>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="hn-footer">
        <div className="f-logo f-logo-img">
          <Image src="/brand/beckett-horizontal-logo.png" alt="Beckett" width={118} height={30} />
        </div>
        <div className="f-copy">© 2026 Beckett. For brains that work differently.</div>
        <div className="f-links">
          <a href="/privacy">Privacy</a>
          <a href="mailto:hello@meetbeckett.co">Support</a>
        </div>
      </footer>

    </div>
  );
}
