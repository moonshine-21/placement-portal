import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { loadMatches, loadCompanies } from '@/lib/data';
import { Sparkles, Send, Bot, User as UserIcon } from 'lucide-react';
import type { Match, Company } from '@/lib/supabase';

const SUGGESTIONS = [
  'What skills should I learn?',
  'Which companies match me best?',
  'How do I improve my match score?',
  "What's my skill gap?",
  'Suggest a learning roadmap',
  'How complete is my profile?',
];

export function AIAssistantView() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<{ role: 'bot' | 'user'; text: string; source?: 'gemini' | 'backend' | 'offline'; debug?: string }[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [lastSource, setLastSource] = useState<'gemini' | 'backend' | 'offline' | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (profile) {
      loadMatches(profile.id).then(setMatches);
      loadCompanies().then(setCompanies);
    }
  }, [profile]);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        role: 'bot',
        text: "Hi! I'm your <strong>AI career assistant</strong>. I use your profile, skills, CGPA, and company matches to give personalized advice. Ask me about skills, matches, roadmaps, or profile tips!",
      }]);
    }
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  const smartReply = (question: string): string => {
    const q = question.toLowerCase().trim();
    const skills = profile?.skills || [];
    const cgpa = profile?.cgpa || 0;
    const branch = profile?.branch || '';
    const completion = profile?.profile_completion || 0;
    const name = profile?.full_name || 'there';

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

    // Fallback with context
    return `I can help with:<br/>
• <strong>Skills & gaps</strong> — what to learn next<br/>
• <strong>Company matches</strong> — your best fits<br/>
• <strong>Match scores</strong> — how to improve them<br/>
• <strong>Profile & CGPA</strong> — completion tips<br/>
• <strong>Learning roadmap</strong> — a simple 4-week plan<br/><br/>
You currently have <strong>${skills.length} skills</strong>, CGPA <strong>${cgpa || '—'}</strong>, and <strong>${matches.length} matches</strong>. What should we focus on?`;
  };

  const getAIReply = async (question: string): Promise<{ text: string; source: 'gemini' | 'backend' | 'offline'; debug?: string }> => {
    // 1) Optional Bolt/backend route
    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, profile, matches }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ai && data.reply) return { text: data.reply, source: 'backend' };
      }
    } catch {
      /* no backend */
    }

    // 2) Direct Gemini when VITE_GEMINI_API_KEY is set in .env
    const geminiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
    if (geminiKey) {
      try {
        const skills = profile?.skills || [];
        const sys = `You are a helpful campus placement career assistant for a student.
Student: ${profile?.full_name || 'Student'}, branch ${profile?.branch || 'n/a'}, CGPA ${profile?.cgpa || 'n/a'}.
Skills: ${skills.join(', ') || 'none listed'}.
Profile completion: ${profile?.profile_completion || 0}%.
Top matches: ${matches.slice(0, 5).map((m) => {
  const c = m.companies;
  return `${c?.name || 'Company'} ${m.match_score}% (missing: ${(m.missing_skills || []).join(', ') || 'none'})`;
}).join('; ') || 'none yet'}.
Answer briefly in plain language. You may use simple HTML like <strong> and <br/>. Do not invent companies the student is not matched with.`;

        const sysPrompt = `${sys}\n\nStudent question: ${question}`;
        const callGemini = async (model: string) => {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': geminiKey,
            },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: sysPrompt }] }],
              generationConfig: { temperature: 0.6, maxOutputTokens: 512 },
            }),
          });
          return res;
        };

        // Try the primary model, then fall back to an alternate if it's been deprecated (404).
        const modelsToTry = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
        let res: Response | null = null;
        let lastBody = '';
        for (const model of modelsToTry) {
          res = await callGemini(model);
          if (res.ok) break;
          lastBody = await res.text().catch(() => '');
          if (res.status !== 404) break; // only keep trying on "model retired" errors
        }

        if (res && res.ok) {
          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
          if (text.trim()) return { text: text.trim().replace(/\n/g, '<br/>'), source: 'gemini' };
          const blockReason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
          const debug = `Gemini responded but returned no text (finishReason: ${blockReason || 'unknown'}).`;
          console.warn(debug, data);
          return { text: smartReply(question), source: 'offline', debug };
        } else {
          const debug = `Gemini API error ${res?.status}: ${lastBody.slice(0, 300)}`;
          console.warn(debug);
          return { text: smartReply(question), source: 'offline', debug };
        }
      } catch (err) {
        const debug = `Gemini request failed (network/CORS): ${String(err)}`;
        console.warn(debug);
        return { text: smartReply(question), source: 'offline', debug };
      }
    }

    const debug = 'VITE_GEMINI_API_KEY was not found in this build.';
    console.info(debug);
    return { text: smartReply(question), source: 'offline', debug };
  };

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
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">AI Career Assistant</span>
              <span className="rounded-md bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">AI</span>
            </div>
            <p className="text-xs text-emerald-400">
              {lastSource === 'gemini' ? '⚡ Gemini connected' : lastSource === 'offline' ? '⚠ Offline mode — Gemini not reachable' : 'Ready · profile-aware'}
            </p>
          </div>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto scroll-thin p-5 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
              {m.role === 'bot' && (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]">
                  <Bot size={16} className="text-white" />
                </div>
              )}
              <div className="min-w-0 max-w-[80%]">
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white rounded-br-md'
                      : 'bg-[var(--surface-hover)] text-[var(--text-primary)] rounded-bl-md border border-[var(--border)]'
                  }`}
                  dangerouslySetInnerHTML={{ __html: m.text }}
                />
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
