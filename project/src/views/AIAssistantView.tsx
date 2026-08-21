// ============================================================================
// src/views/AIAssistantView.tsx
//
// WHAT THIS FILE IS: the AI Career Assistant chat page. It tries THREE
// different ways to get a reply, in order, each one a fallback for the
// previous one failing:
//
//   1. "backend"  — call our own server (api/ai-chat.ts), which safely
//                   calls Gemini using a server-only API key. This is the
//                   normal, intended path in production.
//   2. "gemini"   — call Gemini DIRECTLY from the browser, but ONLY if a
//                   VITE_GEMINI_API_KEY happens to be set in this
//                   project's .env file. This exists purely as a
//                   local-development convenience (e.g. running `vite
//                   dev` without the Vercel backend running alongside
//                   it) — SECURITY NOTE: any VITE_-prefixed env var gets
//                   bundled straight into the public JS anyone can view,
//                   so a real API key should never actually be set this
//                   way in a deployed/production build. Leave this .env
//                   var unset in production and path 1 (or 3) handles it.
//   3. "offline"  — a purely local, rule-based reply generator
//                   (`smartReply`) using simple keyword matching — no AI
//                   at all, just handwritten if/else logic. This guarantees
//                   the assistant NEVER goes completely silent, even with
//                   no internet reaching Gemini at all.
//
// The chat window always shows which mode answered (see `lastSource`),
// so nobody is fooled into thinking a canned offline reply is "real AI."
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { loadMatches, loadCompanies } from '@/lib/data';
import { Sparkles, Send, Bot, User as UserIcon } from 'lucide-react';
import type { Match, Company } from '@/lib/supabase';

// The starter "quick question" chips shown before the person has typed
// anything themselves.
const SUGGESTIONS = [
  'What skills should I learn?',
  'Which companies match me best?',
  'How do I improve my match score?',
  "What's my skill gap?",
  'Suggest a learning roadmap',
  'How complete is my profile?',
];

// The AI service sometimes replies in Markdown even when asked not to.
// Convert the common bits (bold, bullet lists, line breaks) into safe HTML
// instead of dumping raw asterisks/dashes onto the screen.
//
// How it works: walks through the reply line by line. A line starting
// with *, -, or • is treated as part of a bulleted list (`<ul><li>`); any
// other non-empty line becomes its own paragraph (`<p>`). `inList` tracks
// whether we're currently "inside" a list, so consecutive bullet lines
// get grouped into ONE <ul> rather than a separate list per line.
function formatAIText(raw: string): string {
  const lines = raw.replace(/\r\n/g, '\n').split('\n'); // normalize Windows-style line endings, then split into individual lines
  const htmlLines: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      htmlLines.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    const bulletMatch = line.match(/^\s*[*\-•]\s+(.*)/);
    if (bulletMatch) {
      if (!inList) {
        htmlLines.push('<ul class="ai-list">');
        inList = true;
      }
      htmlLines.push(`<li>${bulletMatch[1]}</li>`);
    } else {
      closeList(); // a non-bullet line ends whatever list was in progress
      if (line.trim()) htmlLines.push(`<p>${line}</p>`);
    }
  }
  closeList(); // in case the text ended while still inside a list

  let html = htmlLines.join('');
  // **bold** -> <strong>bold</strong> (done AFTER the structural HTML
  // above is built, so any ** that happened to be inside a bullet still
  // gets converted correctly).
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Clean up any leftover stray single asterisks Gemini sometimes leaves
  // dangling (that weren't part of a real **bold** pair) — the negative
  // lookbehind/lookahead here (`(?<![*\w])` / `(?!\*)`) makes sure this
  // doesn't accidentally eat asterisks that ARE meant to render, like in
  // a math expression.
  html = html.replace(/(?<![*\w])\*(?!\*)/g, '');
  return html;
}

export function AIAssistantView() {
  const { profile } = useAuth();
  // Each chat message tracks which "source" answered it (see the 3-tier
  // system explained above) and, for offline replies, a `debug` note
  // explaining WHY it fell back (shown as a small warning under the message).
  const [messages, setMessages] = useState<{ role: 'bot' | 'user'; text: string; source?: 'gemini' | 'backend' | 'offline'; debug?: string }[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false); // shows the "..." typing-indicator bubble while waiting for a reply
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [lastSource, setLastSource] = useState<'gemini' | 'backend' | 'offline' | null>(null); // drives the small status line under the header ("AI Assistant active" etc)
  const bodyRef = useRef<HTMLDivElement>(null); // used to auto-scroll the chat to the bottom on new messages

  // Load the student's profile-derived context (matches + company list)
  // once, up front — this is what gets sent along with every question so
  // the AI (or the offline fallback) can give personalized answers.
  useEffect(() => {
    if (profile) {
      loadMatches(profile.id).then(setMatches);
      loadCompanies().then(setCompanies);
    }
  }, [profile?.id]);

  // Show a one-time welcome message the very first time this page opens.
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        role: 'bot',
        text: "Hi! I'm your <strong>AI career assistant</strong>. I use your profile, skills, CGPA, and company matches to give personalized advice. Ask me about skills, matches, roadmaps, or profile tips!",
      }]);
    }
  }, []);

  // Auto-scroll the chat window to the bottom whenever a new message is
  // added, or when the typing indicator appears/disappears — keeps the
  // latest message always in view without the person having to scroll manually.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  // ---------- TIER 3: the fully offline, rule-based fallback ----------
  // A big keyword-matching function — no AI involved at all. Each `if`
  // block checks the question against a regular expression of related
  // keywords, and if it matches, builds a reply using real data from the
  // student's own profile/matches (so even the "dumb" fallback still
  // feels personalized, not like a generic canned response).
  const smartReply = (question: string): string => {
    const q = question.toLowerCase().trim();
    const skills = profile?.skills || [];
    const cgpa = profile?.cgpa || 0;
    const branch = profile?.branch || '';
    const completion = profile?.profile_completion || 0;
    const name = profile?.full_name || 'there';

    // `flatMap` combines every match's missing_skills arrays into one big
    // flat list, and `new Set(...)` removes duplicates from it.
    const missingAll = [...new Set(matches.flatMap((m) => m.missing_skills || []))];
    const topMatches = [...matches].sort((a, b) => b.match_score - a.match_score).slice(0, 5);
    const eligible = matches.filter((m) => m.eligible);
    const high = matches.filter((m) => m.match_score >= 85);

    // Greetings
    if (/^(hi|hello|hey|hola|namaste)\b/.test(q) || q === 'hi' || q === 'hello') {
      return `Hi ${name}! 👋 I'm your career assistant. I can analyze your <strong>${skills.length} skills</strong>, CGPA (<strong>${cgpa || 'not set'}</strong>), and <strong>${matches.length} company matches</strong>. What would you like help with?`;
    }

    // Profile completeness
    if (/profile|complete|completion|finish/.test(q)) {
      const tips: string[] = [];
      if (!profile?.full_name) tips.push('Add your full name');
      if (!profile?.bio || (profile.bio?.length || 0) < 10) tips.push('Write a short bio (2–3 lines)');
      if (!branch) tips.push('Set your branch');
      if (!cgpa) tips.push('Add your CGPA');
      if (skills.length === 0) tips.push('Add skills (or upload a resume)');
      if (!profile?.avatar_url) tips.push('Upload a profile photo');
      if (tips.length === 0) {
        return `Your profile is <strong>${completion}% complete</strong> — looking solid! Keep skills updated as you learn new things.`;
      }
      return `Your profile is <strong>${completion}% complete</strong>. To improve it:<br/>• ${tips.join('<br/>• ')}`;
    }

    // Skills / learn / study / gap
    if (/skill|learn|study|gap|missing|roadmap|what should i/.test(q)) {
      if (missingAll.length > 0) {
        const topMissing = missingAll.slice(0, 6);
        const roadmap = topMissing.map((s, i) => `${i + 1}. <strong>${s}</strong> — practice with a small project or course`).join('<br/>');
        return `Based on companies you're matched with, prioritize these skills:<br/><br/>${roadmap}<br/><br/>You already have: <strong>${skills.slice(0, 8).join(', ') || 'none listed yet'}</strong>. Closing the top gaps will raise your match scores the most.`;
      }
      if (skills.length === 0) {
        return `You haven't added skills yet. Go to <strong>Profile</strong> or <strong>Upload Documents</strong> and add skills like JavaScript, Python, React, SQL, or whatever matches your branch (${branch || 'your field'}).`;
      }
      return `Your skills look solid: <strong>${skills.join(', ')}</strong>. Keep practicing them, ship 1–2 portfolio projects, and check the Matches page for any remaining gaps.`;
    }

    // Matches / companies / best
    if (/match|company|best|recommend|apply|eligible/.test(q)) {
      if (!matches.length) {
        return `No matches yet. Complete your profile (skills, CGPA, branch) and open the <strong>Match & Recommendations</strong> page to generate matches against ${companies.length || 'available'} companies.`;
      }
      const lines = topMatches.map((m, i) => {
        const c = m.companies;
        const nameC = c?.name || 'Company';
        const role = c?.role || '';
        const pkg = c?.package_lpa != null ? `₹${c.package_lpa} LPA` : '';
        const gap = m.missing_skills?.length ? ` — gap: ${m.missing_skills.slice(0, 3).join(', ')}` : ' — fully eligible';
        return `${i + 1}. <strong>${nameC}</strong> (${m.match_score}%)${role ? ` · ${role}` : ''}${pkg ? ` · ${pkg}` : ''}${gap}`;
      }).join('<br/>');
      return `You have <strong>${matches.length}</strong> matches (${eligible.length} eligible, ${high.length} at 85%+).<br/><br/>Top picks:<br/>${lines}<br/><br/>Open <strong>Match & Recommendations</strong> to apply.`;
    }

    // Score / improve
    if (/score|improve|better|boost|rank/.test(q)) {
      if (!matches.length) {
        return 'Complete your profile (skills + CGPA + branch), then generate matches. Scores combine skill overlap, CGPA vs minimum, branch fit, and profile completeness.';
      }
      const avg = Math.round(matches.reduce((s, m) => s + m.match_score, 0) / matches.length);
      const advice: string[] = [];
      if (missingAll.length) advice.push(`Learn: ${missingAll.slice(0, 4).join(', ')}`);
      if (cgpa < 7.5) advice.push('Aim for CGPA 7.5+ where possible');
      if (completion < 80) advice.push('Raise profile completion above 80%');
      if (skills.length < 5) advice.push('List at least 5–8 relevant skills');
      return `Your average match score is <strong>${avg}%</strong> (${high.length} high matches).<br/><br/>To improve:<br/>• ${advice.length ? advice.join('<br/>• ') : 'Apply to your top matches and keep skills updated.'}`;
    }

    // CGPA
    if (/cgpa|gpa|grade|marks/.test(q)) {
      if (!cgpa) return 'Your CGPA is not set. Add it on the Profile page. Most companies want 6.5–7.5+.';
      if (cgpa >= 8.5) return `Your CGPA is <strong>${cgpa}</strong> — excellent. You clear almost every company's minimum. Focus on skills and projects.`;
      if (cgpa >= 7.5) return `Your CGPA is <strong>${cgpa}</strong> — meets most requirements. Pair it with strong skills to unlock S-tier roles.`;
      if (cgpa >= 6.5) return `Your CGPA is <strong>${cgpa}</strong>. Some companies need 7.0–7.5+. Emphasize projects and skills to offset borderline GPA.`;
      return `Your CGPA is <strong>${cgpa}</strong>. Many listings require higher. Maximize skills, projects, and applications to companies with lower thresholds.`;
    }

    // Roadmap / plan
    if (/roadmap|plan|path|career|future/.test(q)) {
      const focus = missingAll.slice(0, 3);
      return `Suggested 4-week plan for ${name}:<br/><br/>
<strong>Week 1–2:</strong> ${focus.length ? `Learn ${focus.join(' & ')}` : 'Deepen your top 2 skills'} with tutorials + notes.<br/>
<strong>Week 3:</strong> Build one small project that uses those skills; put it on GitHub.<br/>
<strong>Week 4:</strong> Update Profile & resume, regenerate matches, apply to your top 3–5 companies.<br/><br/>
Current profile: <strong>${completion}%</strong> · Skills: <strong>${skills.length}</strong> · Matches: <strong>${matches.length}</strong>`;
    }

    // Resume / upload
    if (/resume|cv|upload|document/.test(q)) {
      return 'Use <strong>Upload Documents</strong> to attach your resume. The analyzer extracts skills (and CGPA when possible) and adds them to your profile automatically.';
    }

    // Thanks
    if (/thank|thanks|thx|cool|great|nice/.test(q)) {
      return "You're welcome! Ask anytime about skills, matches, or your profile. Good luck with placements! 🚀";
    }

    // Fallback for anything that didn't match a specific topic above — a
    // generic "here's what I can help with" menu, still personalized
    // with the student's real numbers at the end.
    return `I can help with:<br/>
• <strong>Skills & gaps</strong> — what to learn next<br/>
• <strong>Company matches</strong> — your best fits<br/>
• <strong>Match scores</strong> — how to improve them<br/>
• <strong>Profile & CGPA</strong> — completion tips<br/>
• <strong>Learning roadmap</strong> — a simple 4-week plan<br/><br/>
You currently have <strong>${skills.length} skills</strong>, CGPA <strong>${cgpa || '—'}</strong>, and <strong>${matches.length} matches</strong>. What should we focus on?`;
  };

  // The main "get a reply" function — tries each of the 3 tiers in
  // order, falling through to the next one on any failure.
  const getAIReply = async (question: string): Promise<{ text: string; source: 'gemini' | 'backend' | 'offline'; debug?: string }> => {
    // ---------- TIER 1: server-side proxy (Vercel function at /api/ai-chat) ----------
    // Keeps the real Gemini key off the client and retries transient
    // rate-limit/overload errors server-side. See api/ai-chat.ts. Falls
    // through silently if not deployed (e.g. local `vite dev` without
    // `vercel dev` running alongside it, where this endpoint doesn't exist).
    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, profile, matches }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ai && data.reply) return { text: formatAIText(data.reply), source: 'backend' };
        console.warn('AI Assistant: /api/ai-chat responded but had no usable reply:', data);
      } else {
        console.warn(`AI Assistant: /api/ai-chat returned ${res.status}:`, await res.text().catch(() => '(no body)'));
      }
    } catch (err) {
      console.warn('AI Assistant: /api/ai-chat request failed (is the function deployed?):', err);
    }

    // ---------- TIER 2: direct Gemini call, only if a dev-only key is set ----------
    const geminiKey = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();
    if (geminiKey) {
      try {
        const skills = profile?.skills || [];
        // The exact same "persona + rules" prompt style used server-side
        // in api/ai-chat.ts's buildPrompt — kept consistent so the
        // assistant behaves the same regardless of which tier answers.
        const sys = `You are a campus placement career assistant chatting with a student in an ongoing conversation. Talk like a real person having a conversation, not like you're generating a report.

Reference info about the student — you have this so you CAN answer questions about it, not so you should recite it. Only bring up specific numbers (CGPA, completion %, match scores) when the question is actually about that.
Name: ${profile?.full_name || 'Student'}
Branch: ${profile?.branch || 'n/a'}
CGPA: ${profile?.cgpa || 'n/a'}
Skills: ${skills.join(', ') || 'none listed'}
Profile completion: ${profile?.profile_completion || 0}%
Top matches: ${matches.slice(0, 5).map((m) => {
  const c = m.companies;
  return `${c?.name || 'Company'} ${m.match_score}% (missing: ${(m.missing_skills || []).join(', ') || 'none'})`;
}).join('; ') || 'none yet'}

Rules:
1. Match your reply's length and content to what was actually asked. A greeting or small talk ("hi", "how are you", "thanks", "uh", "ok") gets a short, natural, one- or two-sentence reply — never a profile recap, never a CGPA/match-score dump.
2. Only give the fuller career-counselor breakdown (matches, skills, roadmap, completion tips) when the student asks something that calls for it.
3. Never open with a repeated template like "Hello Dev! ...". Vary your phrasing message to message like a real conversation would.
4. Do not invent companies — only mention ones listed in "Top matches" above. If there are none, say so plainly instead of naming any company.
5. No Markdown syntax: no ** for bold, no * or - for bullets, no # headers. Plain sentences and short paragraphs; a line may start with "•" if a list genuinely helps.`;

        const sysPrompt = `${sys}\n\nStudent's message: ${question}`;
        const callGemini = async (model: string) => {
          // Gemini 2.5 models use thinkingBudget; Gemini 3.x replaced it with
          // thinkingLevel and returns a 400 if the old field is sent instead.
          const thinkingConfig = model.startsWith('gemini-2.5')
            ? { thinkingBudget: 0 }
            : { thinkingLevel: 'low' };
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': geminiKey,
            },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: sysPrompt }] }],
              generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 1024,
                thinkingConfig,
              },
            }),
          });
          return res;
        };

        // Try the primary model, then fall back to an alternate if it's
        // been deprecated (404). Also retry once on 429 (rate limited) /
        // 503 (overloaded) — transient failures worth one retry under load.
        const modelsToTry = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
        let res: Response | null = null;
        let lastBody = '';
        // `outer:` is a LABELED loop — a rarely-used JS feature that lets
        // `break outer` jump out of BOTH the inner attempt-loop AND the
        // outer model-loop at once, from deep inside the inner loop.
        // Without this label, a plain `break` would only exit the
        // innermost loop, leaving the outer model loop to keep going
        // unnecessarily even after we'd already found a working response.
        outer: for (const model of modelsToTry) {
          for (let attempt = 0; attempt < 2; attempt++) {
            res = await callGemini(model);
            if (res.ok) break outer; // success — stop everything
            lastBody = await res.text().catch(() => '');
            if (res.status === 429 || res.status === 503) {
              if (attempt === 0) { await new Promise((r) => setTimeout(r, 500)); continue; } // brief pause, then retry same model once
              break; // still failing after retry — move to next model
            }
            if (res.status !== 404) break outer; // non-retryable, non-"model retired" error — stop entirely
            break; // 404 specifically means "this model no longer exists" — try the next model in the list
          }
        }

        if (res && res.ok) {
          const data = await res.json();
          const candidate = data?.candidates?.[0];
          const text = candidate?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
          const finishReason = candidate?.finishReason;
          if (text.trim()) {
            if (finishReason === 'MAX_TOKENS') {
              console.warn('Gemini reply hit the token limit and may be truncated.');
            }
            return { text: formatAIText(text.trim()), source: 'gemini' };
          }
          // Got a 200 response but somehow no actual text back — fall
          // through to the offline tier rather than showing a blank reply.
          const blockReason = finishReason || data?.promptFeedback?.blockReason;
          console.warn(`AI service returned no text (finishReason: ${blockReason || 'unknown'}).`, data);
          return { text: smartReply(question), source: 'offline', debug: 'The AI service returned an empty response, so quick-tips mode was used instead.' };
        } else {
          console.warn(`AI service error ${res?.status}:`, lastBody.slice(0, 500));
          return { text: smartReply(question), source: 'offline', debug: 'The AI service is temporarily unavailable, so quick-tips mode was used instead.' };
        }
      } catch (err) {
        console.warn('AI service request failed:', err);
        return { text: smartReply(question), source: 'offline', debug: 'Could not reach the AI service, so quick-tips mode was used instead.' };
      }
    }

    // ---------- TIER 3: no server, no dev key — go straight to offline ----------
    console.info('AI Assistant: no API key configured for this build — using quick-tips mode.');
    return { text: smartReply(question), source: 'offline', debug: 'Live AI is not configured yet, so quick-tips mode was used instead.' };
  };

  // Sends a question — either typed into the input box, or from a
  // clicked suggestion chip (`text` parameter lets a suggestion chip
  // trigger this directly with its own text, bypassing the input box).
  const send = async (text?: string) => {
    const question = (text || input).trim();
    if (!question) return;
    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    setInput('');
    setShowSuggestions(false);
    setTyping(true);
    const { text: reply, source, debug } = await getAIReply(question);
    setLastSource(source);
    setTyping(false);
    setMessages((prev) => [...prev, { role: 'bot', text: reply, source, debug }]);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="glass flex h-[calc(100vh-8rem)] flex-col overflow-hidden">
        {/* ---------- Header ---------- */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">AI Career Assistant</span>
              <span className="rounded-md bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">AI</span>
            </div>
            {/* This small status line honestly reflects which tier
                actually answered the LAST message — so if it silently
                fell back to offline mode, the person can tell. */}
            <p className="text-xs text-emerald-400">
              {lastSource === 'gemini' ? '⚡ AI Assistant active' : lastSource === 'offline' ? '⚠ Quick-tips mode' : 'Ready · profile-aware'}
            </p>
          </div>
        </div>

        {/* ---------- Message list ---------- */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto scroll-thin p-5 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
              {/* Bot messages get an icon on the LEFT; user messages get
                  one on the RIGHT — achieved just by which side of the
                  bubble each icon block is placed on in the JSX, combined
                  with `justify-end`/`justify-start` above. */}
              {m.role === 'bot' && (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]">
                  <Bot size={16} className="text-white" />
                </div>
              )}
              <div className="min-w-0 max-w-[80%]">
                <div
                  className={`ai-rich-text rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white rounded-br-md'
                      : 'bg-[var(--surface-hover)] text-[var(--text-primary)] rounded-bl-md border border-[var(--border)]'
                  }`}
                  // `dangerouslySetInnerHTML` renders raw HTML instead of
                  // plain text — needed here because `formatAIText`
                  // built real HTML tags (`<strong>`, `<ul>`, etc) for
                  // the message. React names this prop "dangerous" as a
                  // reminder that raw HTML from an untrusted source COULD
                  // be a security risk (script injection) — this is
                  // considered acceptable here because the HTML is
                  // either our own hardcoded smartReply() strings, or
                  // built by formatAIText() from Gemini's plain-text
                  // reply (Gemini isn't asked to output any HTML/script
                  // tags, and none of this text is ever inserted as
                  // executable attributes).
                  dangerouslySetInnerHTML={{ __html: m.text }}
                />
                {/* A small honesty note under any offline-mode reply,
                    explaining briefly why real AI wasn't used this time. */}
                {m.role === 'bot' && m.source === 'offline' && m.debug && (
                  <p className="mt-1 px-1 text-[10px] text-amber-400/80">⚠ {m.debug}</p>
                )}
              </div>
              {m.role === 'user' && (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--surface)] border border-[var(--border-strong)]">
                  <UserIcon size={16} className="text-[var(--text-secondary)]" />
                </div>
              )}
            </div>
          ))}
          {/* The "..." typing indicator, shown only while waiting for a reply. */}
          {typing && (
            <div className="flex gap-3 animate-fade-in">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]">
                <Bot size={16} className="text-white" />
              </div>
              <div className="rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface-hover)] px-4 py-3">
                <div className="typing-dots"><span></span><span></span><span></span></div>
              </div>
            </div>
          )}
        </div>

        {/* Suggestion chips only shown before the person has really
            started chatting (i.e. still just the one welcome message). */}
        {showSuggestions && messages.length <= 1 && (
          <div className="border-t border-[var(--border)] p-4">
            <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-xs font-medium text-[var(--accent)] transition-all hover:bg-[var(--accent)]/20 hover:scale-105"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---------- Input bar ---------- */}
        <div className="border-t border-[var(--border)] p-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => { setInput(e.target.value); setShowSuggestions(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="Ask about skills, companies, roadmap…"
              className="input-field flex-1"
            />
            <button onClick={() => send()} disabled={!input.trim()} className="btn-primary h-10 w-10 !px-0 flex-shrink-0">
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
