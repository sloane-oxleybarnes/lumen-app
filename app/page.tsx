"use client";

import { useState, useEffect } from "react";
import "./home.css";

export default function HomePage() {
  const [betaEmail, setBetaEmail] = useState("");
  const [betaStatus, setBetaStatus] = useState<"idle" | "loading" | "done">("idle");
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    const sections = ["features", "integrations", "skills", "pricing", "beta"];
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

  function navLink(href: string, label: string, isCta = false) {
    const id = href.replace("#", "");
    return (
      <a
        href={href}
        className={isCta ? "nav-cta" : activeSection === id ? "active" : ""}
      >
        {label}
      </a>
    );
  }

  return (
    <div className="lumen-home">
      {/* NAV */}
      <nav className="hn-nav">
        <a href="#" className="nav-logo">beck<span>ett</span></a>
        <div className="nav-links">
          {navLink("#features", "Features")}
          {navLink("#integrations", "Integrations")}
          {navLink("#skills", "Skill learning")}
          {navLink("#pricing", "Pricing")}
          {navLink("#beta", "Beta")}
          {navLink("#beta", "Get early access", true)}
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="kicker">Your personal communication coach</div>
        <h1>Find the right words,<br /><em>every time.</em></h1>
        <p className="hero-sub">
          Beckett helps you decode what people really mean, draft responses that land, and practice the conversations that feel hardest — right inside the tools you use every day.
        </p>
        <div className="hero-actions">
          <a href="#beta" className="btn-primary">Get early access — it&apos;s free</a>
          <a href="#features" className="btn-secondary">See all features</a>
        </div>

        {/* Browser mockup */}
        <div className="hero-visual">
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
                  <p>Per my last email, I wanted to make sure we&apos;re on the same page before the all-hands. Going forward, let&apos;s make sure decisions like this go through the right channels first.</p>
                  <div className="e-highlight">&ldquo;Going forward, let&apos;s make sure decisions like this go through the right channels first.&rdquo;</div>
                  <p>Looking forward to syncing on this.</p>
                </div>
              </div>
              <div className="b-sidebar">
                <div className="b-header">
                  <div className="b-logo"><div className="b-dot" />beckett</div>
                  <div className="m-pills">
                    <div className="m-pill">Personal</div>
                    <div className="m-pill on">Business</div>
                  </div>
                </div>
                <div className="i-card">
                  <div className="i-label">What&apos;s really going on</div>
                  <div className="i-text">Sarah is signaling frustration that you acted without her approval — a soft correction, not open conflict.</div>
                </div>
                <div className="i-card">
                  <div className="i-label">What she needs from you</div>
                  <div className="i-text">A calm acknowledgment that you understand the process and won&apos;t bypass it again.</div>
                </div>
                <div className="r-section-label">Draft responses</div>
                <div className="r-card">
                  <div className="r-tag t-warm">Warm</div>
                  <div className="r-text">Appreciate the note, Sarah. Happy to sync before the all-hands to make sure we&apos;re fully aligned.</div>
                  <div className="r-copy"><button>Copy</button></div>
                </div>
                <div className="r-card">
                  <div className="r-tag t-direct">Direct</div>
                  <div className="r-text">Thanks for flagging — I&apos;ll make sure to loop you in before moving forward on decisions like this.</div>
                  <div className="r-copy"><button>Copy</button></div>
                </div>
                <button className="ins-btn">↗ Insert into Gmail</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features">
        <div className="container">
          <div className="sec-label">Everything in Beckett</div>
          <h2>Your coach,<br /><em>always in your corner.</em></h2>
          <p className="sec-sub">Beckett works inside the apps you already use — reading context, coaching your responses, and helping you practice — so you&apos;re always prepared.</p>
          <div className="feat-grid">
            {[
              { n: "01", title: "Message decoder", text: "Beckett reads incoming Gmail and Slack messages and explains what's really going on — the subtext, the tone, what the person actually needs from you.", plan: "free" },
              { n: "02", title: "Draft from scratch", text: "Tell Beckett what you want to communicate and it writes the message for you. Your coach puts your thoughts into words that land the way you intend.", plan: "free" },
              { n: "03", title: "Safe people mode", text: "Mark close contacts as safe. With safe people, Beckett relaxes entirely — no coaching layer, just natural warmth. Because not every relationship needs the same approach.", plan: "free" },
              { n: "04", title: "Personal vs business mode", text: "One toggle, two distinct approaches. Personal mode is warm and casual. Business mode is composed and professional — for the moments where that matters.", plan: "pro" },
              { n: "05", title: "Tone calibration", text: "Beckett learns from how you actually communicate. Over time, its suggestions start sounding more like you — your vocabulary, your rhythm, your natural style.", plan: "pro" },
              { n: "06", title: "Full thread context", text: "Beckett reads the entire conversation, not just the latest message — so its coaching is grounded in the full context of what's actually going on.", plan: "pro" },
              { n: "07", title: "Pre-meeting briefs", text: "Before every meeting, your coach surfaces who's attending, recent threads with each person, and talking points to help you walk in confident and prepared.", plan: "pro" },
              { n: "08", title: "Live meeting guidance", text: "During Google Meet and Zoom calls, Beckett reads live captions and coaches you in real time — what's happening in the room and what to say next.", plan: "pro" },
              { n: "09", title: "Post-conversation debrief", text: "After a meeting ends, your coach gives you a debrief — what landed well, one moment worth revisiting, and a ready-to-send follow-up.", plan: "pro" },
              { n: "10", title: "Contact history", text: "Pull your full history with one person across Gmail and Slack. Beckett uses it to understand the relationship — so every suggestion reflects what's actually happened between you.", plan: "pro" },
              { n: "11", title: "AI conversation practice", text: "Practice a hard conversation before you have it. Your coach plays the other person — realistically, including pushback. Then get a debrief on what worked.", plan: "pro" },
              { n: "12", title: "Skill training modules", text: "Structured coaching sessions for specific real-life situations. Your coach walks you through what to say, how to respond, and practices it with you until it feels natural.", plan: "pro" },
            ].map((f) => (
              <div key={f.n} className="feat-card">
                <div className="feat-num">{f.n}</div>
                <div className="feat-title">{f.title}</div>
                <div className="feat-text">{f.text}</div>
                <span className={`feat-plan ${f.plan === "free" ? "p-free" : "p-pro"}`}>
                  {f.plan === "free" ? "Free" : "Pro"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLATFORMS */}
      <div className="plat-wrap">
        <div className="container">
          <div className="sec-label">Platforms</div>
          <h2>Your coach lives<br /><em>inside every app.</em></h2>
          <p className="sec-sub">Beckett injects directly into the tools you already use — no copy-pasting, no switching tabs, no extra windows.</p>
          <div className="plat-grid">
            {[
              { icon: "pi-gmail", letter: "G", name: "Gmail", desc: "Reads your full inbox threads. One click to insert a coached reply into your compose window." },
              { icon: "pi-slack", letter: "S", name: "Slack", desc: "Reads messages in real time across DMs and channels. Inserts coached replies directly into Slack." },
              { icon: "pi-meet", letter: "M", name: "Google Meet", desc: "Reads live captions during calls. Real-time guidance in a floating sidebar — what's happening and what to say next." },
              { icon: "pi-zoom", letter: "Z", name: "Zoom", desc: "Reads Zoom web client captions. Same real-time coaching as Meet, with graceful fallback." },
            ].map((p) => (
              <div key={p.name} className="plat-card">
                <div className={`plat-icon ${p.icon}`}>{p.letter}</div>
                <div className="plat-name">{p.name}</div>
                <div className="plat-desc">{p.desc}</div>
                <div className="plat-live">Live</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MODES */}
      <section>
        <div className="container">
          <div className="sec-label">Two modes</div>
          <h2>Personal or professional —<br /><em>you choose the tone.</em></h2>
          <p className="sec-sub">One toggle changes everything. Your coach adjusts its entire approach to match the context you&apos;re actually in.</p>
          <div className="modes-grid">
            <div className="mode-card mc-personal">
              <div className="mc-label">Personal mode</div>
              <h3>Warm and real</h3>
              <p>Casual, human, genuine. For the people and moments that don&apos;t need a professional layer. Your coach steps back and lets you just be yourself — with a little support when you want it.</p>
              <div className="mc-example">&ldquo;Hey, totally fair — I should&apos;ve looped you in earlier. Let&apos;s sync before the call so we&apos;re on the same page.&rdquo;</div>
            </div>
            <div className="mode-card mc-business">
              <div className="mc-label">Business mode</div>
              <h3>Composed and clear</h3>
              <p>Professional, collegial, confident. For the moments where how you say something matters as much as what you say. Your coach helps you navigate workplace dynamics with ease.</p>
              <div className="mc-example">&ldquo;Thank you for flagging this. I appreciate the context and will ensure I align with you before moving forward on decisions of this nature.&rdquo;</div>
            </div>
          </div>
        </div>
      </section>

      {/* INTEGRATIONS */}
      <section id="integrations">
        <div className="container">
          <div className="sec-label">Integrations</div>
          <h2>More apps,<br /><em>coming soon.</em></h2>
          <p className="sec-sub">Beckett is expanding to every place where important conversations happen. Here&apos;s what&apos;s on the roadmap.</p>
          <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--ink-light)", textTransform: "uppercase", letterSpacing: ".08em", margin: "3.5rem 0 1rem" }}>
            Coming soon
          </div>
          <div className="int-live-grid">
            {[
              { icon: "📘", name: "Microsoft Teams", desc: "The same coaching experience for enterprise Teams users — the largest untapped market for Beckett.", tag: "soon" },
              { icon: "📧", name: "Outlook", desc: "Full coaching integration for Outlook — pairs with Teams for complete enterprise coverage.", tag: "soon" },
              { icon: "💼", name: "LinkedIn Messaging", desc: "Coaching for networking, cold outreach, and recruiter conversations — some of the highest-stakes communication there is.", tag: "soon" },
              { icon: "📝", name: "Notion", desc: "Coaching for async written communication in Notion comments and docs — where a lot of real workplace communication happens.", tag: "soon" },
              { icon: "🎬", name: "Loom", desc: "Pre-recording coaching before you hit record — talking points, tone check, and a practice run so you feel prepared.", tag: "soon" },
              { icon: "⭐", name: "Performance reviews", desc: "Coaching for self-reviews, peer feedback, and receiving critical feedback — in Lattice, Culture Amp, Workday, and more.", tag: "soon" },
              { icon: "💬", name: "Discord", desc: "Coaching for community and professional Discord servers — where real work conversations increasingly happen.", tag: "soon" },
              { icon: "📅", name: "Google Calendar", desc: "Already powering pre-meeting briefs — surfacing attendee context and talking points before every event on your calendar.", tag: "dev" },
            ].map((item) => (
              <div key={item.name} className="int-card dim">
                <div className="int-icon">{item.icon}</div>
                <div className="int-name">{item.name}</div>
                <div className="int-desc">{item.desc}</div>
                {item.tag === "dev" ? (
                  <span className="int-dev">In development</span>
                ) : (
                  <span className="int-soon">Coming soon</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SKILLS */}
      <section id="skills">
        <div className="container">
          <div className="sec-label">Skill learning</div>
          <h2>Practice the conversations<br />that actually <em>matter.</em></h2>
          <p className="sec-sub">Your coach walks you through the conversations most people never actually practice. Each module is a structured coaching session — context, a realistic practice round, then a debrief on what worked.</p>
          <div className="skills-grid">
            {[
              { diff: "d-low", label: "Low stakes", title: "How to ask someone out", desc: "Reading signals, phrasing the ask naturally, and responding gracefully whatever the answer." },
              { diff: "d-med", label: "Medium stakes", title: "Setting a work boundary", desc: "Calm, professional language for protecting your time and energy — with a colleague or your manager." },
              { diff: "d-med", label: "Medium stakes", title: "Giving difficult feedback", desc: "Framing and tone that lands without damaging the relationship or demoralizing the other person." },
              { diff: "d-high", label: "High stakes", title: "Asking for a raise", desc: "Building the case, bringing it up for the first time, and responding to \"the budget is tight right now.\"" },
              { diff: "d-low", label: "Low stakes", title: "Navigating small talk", desc: "Starting conversations at events, keeping them going, and exiting gracefully without it feeling awkward." },
              { diff: "d-med", label: "Medium stakes", title: "Handling passive aggression", desc: "De-escalation and clarity for when someone is being indirect — in messages and in meetings." },
            ].map((s) => (
              <div key={s.title} className="skill-card">
                <div className={`sk-diff ${s.diff}`}>{s.label}</div>
                <div className="sk-title">{s.title}</div>
                <div className="sk-desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing">
        <div className="container">
          <div className="sec-label">Pricing</div>
          <h2>Start free.<br /><em>Grow into it.</em></h2>
          <p className="sec-sub">The core coaching tools are free with no limits. Pro unlocks the features that make Beckett indispensable.</p>
          <div className="pricing-grid">
            {/* Free */}
            <div className="pr-card">
              <div className="pr-plan">Free</div>
              <div className="pr-price">$0</div>
              <div className="pr-period">forever, no limits</div>
              <ul className="pr-feats">
                {["Message decoder — Gmail + Slack", "Draft from scratch", "Safe people mode", "Personal mode", "Right rail side panel", "No daily caps, ever"].map((f) => <li key={f}>{f}</li>)}
              </ul>
              <a href="#beta" className="pr-cta pr-cta-out">Get started free</a>
            </div>
            {/* Pro */}
            <div className="pr-card featured">
              <div className="pr-plan">Pro</div>
              <div className="pr-price">$9</div>
              <div className="pr-period">per month</div>
              <ul className="pr-feats">
                {["Everything in Free", "Business mode + LinkedIn context", "Tone calibration — learns your voice", "Full conversation thread history", "Pre-meeting briefs", "Live meeting guidance (Meet + Zoom)", "Post-conversation debrief", "Contact history across Gmail + Slack", "AI conversation practice", "All 6 skill training modules"].map((f) => <li key={f}>{f}</li>)}
                <li className="pr-soon">Personal dashboard — coming soon</li>
                <li className="pr-soon">Emotional pattern tracking — coming soon</li>
              </ul>
              <a href="#beta" className="pr-cta pr-cta-fill">Start Pro free in beta</a>
            </div>
            {/* Team */}
            <div className="pr-card">
              <div className="pr-plan">Team</div>
              <div className="pr-price">$7</div>
              <div className="pr-period">per seat / month · 5 seats minimum</div>
              <ul className="pr-feats">
                {["Everything in Pro", "5+ seats, 20% off vs Pro", "Shared settings and context", "Team dashboard — coming soon", "Priority support"].map((f) => <li key={f}>{f}</li>)}
              </ul>
              <a href="mailto:hello@meetbeckett.co" className="pr-cta pr-cta-out">Contact us for team access</a>
            </div>
          </div>
        </div>
      </section>

      {/* COMING SOON */}
      <div className="cs-wrap">
        <div className="container">
          <div className="sec-label">What&apos;s next</div>
          <h2>The deeper version<br />is <em>on the way.</em></h2>
          <div className="cs-grid">
            {[
              { n: "01", title: "Personal dashboard", desc: "A private view of your communication patterns — which relationships have friction, how your style shifts under pressure, and how you trend over time.", tag: "Coming soon" },
              { n: "02", title: "Emotional pattern tracking", desc: "Beckett learns when you communicate most naturally — and surfaces gentle insights. Stored locally, always private, framed entirely around your strengths.", tag: "Coming soon" },
              { n: "03", title: "Productivity time-of-day", desc: "Identifies when you're at your best — and gently nudges you to wait before sending difficult responses at the wrong moment.", tag: "Coming soon" },
              { n: "04", title: "Team dashboard", desc: "Org-level communication health for managers. Anonymized, opt-in only, and built to support people — not monitor them.", tag: "Team plan" },
            ].map((c) => (
              <div key={c.n} className="cs-card">
                <div className="cs-num">{c.n}</div>
                <div className="cs-title">{c.title}</div>
                <div className="cs-desc">{c.desc}</div>
                <div className="cs-tag">{c.tag}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TESTIMONIALS */}
      <section>
        <div className="container">
          <div className="sec-label">What people say</div>
          <h2>People who think differently<br />and <em>communicate brilliantly.</em></h2>
          <div className="quote-grid">
            {[
              { av: "qa1", initials: "AK", name: "Alex K.", role: "Software Engineer", quote: "I always knew what I wanted to say. Beckett helps me find the words that actually land — and it gets better at matching my voice the more I use it." },
              { av: "qa2", initials: "MR", name: "Morgan R.", role: "Product Manager", quote: "The live meeting coaching is genuinely game-changing. I finally feel like I can be present in the moment instead of processing everything two hours after the call." },
              { av: "qa3", initials: "JT", name: "Jamie T.", role: "Customer Success", quote: "It doesn't put words in my mouth. It helps me find my own words — the ones I actually mean, in a way that people can hear. That's everything." },
            ].map((q) => (
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
          <div className="sec-label">Beta access</div>
          <h2>Get early access.<br /><em>Full coaching suite, free.</em></h2>
          <p className="sec-sub">Beta users get the full coaching experience — every feature, no limits. Help us shape Beckett before it launches publicly.</p>
          {betaStatus === "done" ? (
            <p className="beta-ok">You&apos;re on the list. We&apos;ll be in touch. ✓</p>
          ) : (
            <form className="beta-form" onSubmit={submitBeta}>
              <input
                className="beta-input"
                type="email"
                placeholder="your@email.com"
                required
                value={betaEmail}
                onChange={(e) => setBetaEmail(e.target.value)}
              />
              <button className="beta-btn" type="submit" disabled={betaStatus === "loading"}>
                {betaStatus === "loading" ? "Sending…" : "Request access"}
              </button>
            </form>
          )}
          <p className="beta-note">No credit card required. Full Pro access during beta.</p>
        </div>
      </div>

      {/* CTA */}
      <div className="cta-wrap">
        <div className="sec-label" style={{ justifyContent: "center" }}>Get started</div>
        <h2>Your coach is<br /><em>already there.</em></h2>
        <p className="sec-sub">Add Beckett to Chrome and your communication coach is waiting inside Gmail, Slack, Google Meet, and Zoom — no copy-pasting, no switching tabs.</p>
        <div className="hero-actions" style={{ justifyContent: "center" }}>
          <a href="#beta" className="btn-primary">Get early access — it&apos;s free</a>
          <a href="#features" className="btn-secondary">Explore features</a>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="hn-footer">
        <div className="f-logo">beck<span>ett</span></div>
        <div className="f-copy">© 2026 Beckett. A communication coach for people who think differently.</div>
        <div className="f-links">
          <a href="#">Privacy</a>
          <a href="#">Support</a>
          <a href="https://github.com/sloane-oxleybarnes/lumen-app">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
