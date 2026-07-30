import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { loadMatches } from '@/lib/data';
import { Sparkles, Send, Bot, User as UserIcon } from 'lucide-react';
import type { Match } from '@/lib/supabase';

const SUGGESTIONS = [
  'What skills should I learn?',
  'Which companies match me best?',
  'How do I improve my match score?',
  "What's my skill gap?",
];

export function AIAssistantView() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<{ role: 'bot' | 'user'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (profile) loadMatches(profile.id).then(setMatches);
  }, [profile]);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{ role: 'bot', text: "Hi! I'm your AI career assistant. I can suggest skills to learn, explain your matches, and help improve your profile. Ask me anything!" }]);
    }
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  const ruleBasedReply = (question: string): string => {
    const q = question.toLowerCase();
    const skills = profile?.skills || [];
    const cgpa = profile?.cgpa || 0;
    if (/hi|hello|hey/.test(q)) return "Hi there! I'm your AI career assistant. I can help with skills, company matches, and profile tips. What would you like to know?";
    if (/skill|learn|study/.test(q)) {
      const missing = [...new Set(matches.flatMap((m) => m.missing_skills || []))];
      if (missing.length) return `To boost your matches, focus on: ${missing.slice(0, 5).map((s) => s).join(', ')}`;
      return `Your skills look solid. Keep practicing ${skills.slice(0, 3).join(', ') || 'your core skills'} and build projects to stand out.`;
    }
    if (/match|company|best/.test(q)) {
      if (!matches.length) return 'No matches yet. Add your skills and CGPA in the Profile page to get matched with companies.';
      const top = matches[0];
      const c = top.companies || top;
      return `Your top match is ${c.name}. ${c.role} at ₹${c.package_lpa} LPA — ${top.match_score}% match. ${top.missing_skills?.length ? `Close the gap: ${top.missing_skills.join(', ')}.` : "You're fully eligible — apply now!"}`;
    }
    if (/score|improve|better/.test(q)) {
      if (!matches.length) return 'Complete your profile to get a match score. Add skills, CGPA, and branch in the Profile page.';
      const avg = Math.round(matches.reduce((s, m) => s + m.match_score, 0) / matches.length);
      return `Your average match is ${avg}%. ${avg >= 75 ? 'Great scores! Apply to your top matches.' : 'Add more relevant skills to push your scores higher.'}`;
    }
    if (/cgpa|grade/.test(q)) return `Your CGPA is ${cgpa || 'not set'}. ${cgpa >= 7.5 ? "That meets most companies' requirements." : 'Aim for 7.5+ to unlock more opportunities.'}`;
    return "I'm here to help! Ask me about skills to learn, your best company matches, how to improve your score, or your CGPA.";
  };

  const getAIReply = async (question: string): Promise<string> => {
    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, profile, matches }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ai && data.reply) return data.reply;
        return ruleBasedReply(question);
      }
      return ruleBasedReply(question);
    } catch {
      return ruleBasedReply(question);
    }
  };

  const send = async (text?: string) => {
    const question = (text || input).trim();
    if (!question) return;
    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    setInput('');
    setShowSuggestions(false);
    setTyping(true);
    const reply = await getAIReply(question);
    setTyping(false);
    setMessages((prev) => [...prev, { role: 'bot', text: reply }]);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="glass flex h-[calc(100vh-8rem)] flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">AI Career Assistant</span>
              <span className="rounded-md bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">AI</span>
            </div>
            <p className="text-xs text-emerald-400">Online</p>
          </div>
        </div>

        {/* Messages */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto scroll-thin p-5 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
              {m.role === 'bot' && (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]">
                  <Bot size={16} className="text-white" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                  m.role === 'user'
                    ? 'bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white rounded-br-md'
                    : 'bg-[var(--surface-hover)] text-[var(--text-primary)] rounded-bl-md border border-[var(--border)]'
                }`}
                dangerouslySetInnerHTML={{ __html: m.text }}
              />
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

        {/* Suggestions */}
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

        {/* Input */}
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
