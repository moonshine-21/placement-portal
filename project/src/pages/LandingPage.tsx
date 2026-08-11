// ============================================================================
// src/pages/LandingPage.tsx
//
// WHAT THIS FILE IS: the public marketing page shown to a visitor who
// isn't logged in yet — the "sales pitch" page explaining what the site
// does, before they sign up or log in. This is almost entirely visual/
// static content (no data fetching, no state to speak of), so most of the
// comments below explain the LAYOUT/DESIGN choices rather than logic.
// ============================================================================

import { Target, Building2, BrainCircuit, ArrowRight, Sparkles, TrendingUp, Users } from 'lucide-react';

// This page only needs one thing from whoever's using it: a function to
// call when the visitor clicks a "get started" style button, so App.tsx
// can decide what to show next (the login page, most likely).
type Props = {
  onOpenDashboard: () => void;
};

export function LandingPage({ onOpenDashboard }: Props) {
  return (
    <div className="min-h-screen">
      {/* ---------- Top navigation bar ---------- */}
      <nav className="glass mx-auto mt-6 flex max-w-6xl items-center justify-between px-6 py-4 animate-slide-down">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]">
            <Sparkles size={20} className="text-white" />
          </div>
          <span className="font-bold text-[var(--text-primary)]">Smart Placement Cell</span>
        </div>
        {/* This link row is hidden on small/mobile screens (`hidden
            md:flex`) — on mobile there's just the single "Open" button
            below instead, to save space. */}
        <div className="hidden items-center gap-6 md:flex">
          <a href="#features" className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors">Features</a>
          <a href="#how" className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors">How it works</a>
          <button onClick={onOpenDashboard} className="btn-primary btn-sm">Open Dashboard</button>
        </div>
        {/* The mobile-only equivalent button (`md:hidden` hides it on
            larger screens, where the row above already has one). */}
        <button onClick={onOpenDashboard} className="btn-primary btn-sm md:hidden">Open</button>
      </nav>

      {/* ---------- Hero section (the big headline at the top) ---------- */}
      <header className="mx-auto max-w-4xl px-4 pt-20 pb-12 text-center">
        <span className="glass-soft inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-[var(--accent)] animate-fade-in">
          <Sparkles size={14} /> AI-powered placements
        </span>
        <h1 className="mt-6 text-4xl font-bold leading-tight md:text-6xl animate-slide-up">
          Match every student<br />
          <span className="gradient-text">to the right company.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-[var(--text-secondary)] animate-slide-up" style={{ animationDelay: '0.1s' }}>
          Smart Placement Cell Portal analyses profiles, skills and hiring trends
          to surface the companies where each student is most likely to succeed.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <button onClick={onOpenDashboard} className="btn-primary btn-lg">
            Launch Dashboard <ArrowRight size={18} />
          </button>
          <a href="#features" className="btn-ghost btn-lg">Explore features</a>
        </div>
      </header>

      {/* ---------- Feature highlight cards ---------- */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-16">
        {/* Rather than write out three nearly-identical <div> cards by
            hand, we define the three cards' content as a plain array of
            data, then `.map()` over it to generate the actual HTML — a
            common React pattern that keeps repeated content easy to edit
            (add a fourth feature by adding one more line to this list,
            not by copy-pasting a whole card's worth of markup). */}
        <div className="grid gap-6 md:grid-cols-3 stagger">
          {[
            { icon: Target, title: 'Match Score', desc: 'Every student gets a transparent score showing fit for each company.' },
            { icon: Building2, title: 'Company Intelligence', desc: 'Live hiring trends, open roles and demand signals across recruiters.' },
            { icon: BrainCircuit, title: 'AI Recommendations', desc: 'Personalised next steps to close skill gaps and boost placement odds.' },
          ].map((f) => (
            <div key={f.title} className="glass card-hover p-7">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-2)]/20 text-[var(--accent)]">
                {/* `<f.icon ... />` — rendering a component that was
                    itself stored as a plain piece of data in the array
                    above. This is valid because in React, a component is
                    just a function, and functions can be stored in
                    variables/arrays like any other value. */}
                <f.icon size={24} />
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">{f.title}</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- "How it works" 3-step explainer ---------- */}
      <section id="how" className="mx-auto max-w-4xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold mb-12">How it works</h2>
        <div className="grid gap-6 md:grid-cols-3 stagger">
          {[
            { num: '1', text: 'Students build profiles with skills, projects and preferences.', icon: Users },
            { num: '2', text: 'AI scores each profile against hundreds of recruiters.', icon: BrainCircuit },
            { num: '3', text: 'Placement officers track and shortlist the best matches.', icon: TrendingUp },
          ].map((s) => (
            <div key={s.num} className="glass p-7 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xl font-bold text-white">
                {s.num}
              </div>
              <s.icon size={28} className="mx-auto mb-3 text-[var(--accent)]" />
              <p className="text-sm text-[var(--text-secondary)]">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="py-12 text-center text-sm text-[var(--text-muted)]">
        <p>Smart Placement Cell Portal · Built with care</p>
      </footer>
    </div>
  );
}
