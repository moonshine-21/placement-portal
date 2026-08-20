import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { askPlacementAI, type AIContext } from '@/lib/aiClient';
import { VoiceSession, isSpeechRecognitionSupported } from '@/lib/voice';
import { AIPresence, type AIVisualState } from './AIPresence';
import type { ViewKey } from '@/components/AppShell';

type Props = {
  onNavigate?: (view: ViewKey | string) => void;
};

type Line = { role: 'user' | 'ai'; text: string };

const INIT_LINES = [
  'SYSTEM INITIALIZING',
  'IDENTITY VERIFIED',
  'PROFILE SYNCHRONIZED',
  'PLACEMENT SIGNAL ANALYZED',
  'INTELLIGENCE SYSTEM ONLINE',
];

export function StageEnvironment({ onNavigate }: Props) {
  const { profile, user } = useAuth();
  const [initDone, setInitDone] = useState(() => sessionStorage.getItem('spc-init-done') === '1');
  const [initIndex, setInitIndex] = useState(0);
  const [aiState, setAiState] = useState<AIVisualState>('idle');
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [micOn, setMicOn] = useState(false);
  const [ctx, setCtx] = useState<AIContext>({});
  const [signals, setSignals] = useState<{ label: string; value: string; meta?: string }[]>([]);
  const voiceRef = useRef(new VoiceSession());
  const historyRef = useRef<{ role: 'user' | 'assistant'; text: string }[]>([]);

  // Load real placement context
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!profile?.id) return;
      setAiState('analyzing');
      const skills = Array.isArray(profile.skills) ? profile.skills : [];
      let matches: AIContext['matches'] = [];
      let applicationsCount = 0;
      let events: AIContext['events'] = [];

      try {
        const { data: apps } = await supabase
          .from('company_applications')
          .select('id', { count: 'exact', head: false })
          .eq('student_id', profile.id);
        applicationsCount = apps?.length || 0;
      } catch { /* ignore */ }

      try {
        const { data: evts } = await supabase
          .from('events')
          .select('title, event_date')
          .gte('event_date', new Date().toISOString())
          .order('event_date', { ascending: true })
          .limit(3);
        events = (evts || []).map((e: any) => ({ title: e.title, date: e.event_date }));
      } catch { /* ignore */ }

      // Matches via existing helper if available — keep simple count from company_profiles
      try {
        const { count } = await supabase
          .from('company_profiles')
          .select('*', { count: 'exact', head: true });
        matches = [{ company: 'Network', score: count || 0, role: 'active organizations' }];
      } catch { /* ignore */ }

      const completionBits = [
        profile.full_name, profile.bio, profile.branch, profile.cgpa,
        skills.length > 0, profile.avatar_url,
      ];
      const profileCompletion = Math.round((completionBits.filter(Boolean).length / 6) * 100);

      if (!alive) return;
      const next: AIContext = {
        name: profile.full_name || undefined,
        branch: profile.branch || undefined,
        cgpa: profile.cgpa ?? null,
        skills,
        bio: profile.bio,
        profileCompletion,
        applicationsCount,
        matches,
        events,
      };
      setCtx(next);
      setSignals([
        { label: 'Profile', value: `${profileCompletion}%`, meta: 'completion' },
        { label: 'Applications', value: String(applicationsCount), meta: 'active' },
        { label: 'Skills', value: String(skills.length), meta: 'listed' },
        { label: 'Events', value: String(events?.length || 0), meta: 'upcoming' },
      ]);
      setAiState('idle');
    })();
    return () => { alive = false; };
  }, [profile?.id]);

  // Cinematic init once per session
  useEffect(() => {
    if (initDone) return;
    if (initIndex >= INIT_LINES.length) {
      const t = setTimeout(() => {
        sessionStorage.setItem('spc-init-done', '1');
        setInitDone(true);
        const hour = new Date().getHours();
        const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
        const name = profile?.full_name?.split(' ')[0] || 'there';
        const apps = ctx.applicationsCount ?? 0;
        const opener = `${greet}, ${name}. I've synchronized your placement profile. ${
          apps > 0
            ? `You have ${apps} application${apps === 1 ? '' : 's'} in motion.`
            : 'When you are ready, we can review opportunities or strengthen your profile.'
        }`;
        setLines([{ role: 'ai', text: opener }]);
        if (voiceOn) {
          setAiState('speaking');
          voiceRef.current.speak(opener, () => setAiState('idle'));
        }
      }, 350);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setInitIndex((i) => i + 1), 280);
    return () => clearTimeout(t);
  }, [initIndex, initDone, profile?.full_name, ctx.applicationsCount, voiceOn]);

  const skipInit = () => {
    sessionStorage.setItem('spc-init-done', '1');
    setInitDone(true);
    setInitIndex(INIT_LINES.length);
  };

  const runAsk = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    voiceRef.current.stopSpeaking();
    setLines((prev) => [...prev, { role: 'user', text: q }]);
    historyRef.current.push({ role: 'user', text: q });
    setAiState('thinking');
    setInput('');

    const res = await askPlacementAI(q, ctx, historyRef.current);
    const reply = res.reply;
    historyRef.current.push({ role: 'assistant', text: reply });
    setLines((prev) => [...prev, { role: 'ai', text: reply }]);
    setAiState(res.ok ? 'speaking' : 'error');

    // Safe action handling
    if (res.action?.type === 'OPEN_VIEW' && onNavigate) {
      onNavigate(res.action.view);
    }

    if (voiceOn && res.ok) {
      voiceRef.current.speak(reply, () => setAiState(res.ok ? 'idle' : 'error'));
    } else {
      setAiState(res.ok ? 'idle' : 'error');
    }
    setBusy(false);
  }, [busy, ctx, onNavigate, voiceOn]);

  const toggleMic = () => {
    if (micOn) {
      voiceRef.current.stopListening();
      setMicOn(false);
      setAiState('idle');
      return;
    }
    if (!isSpeechRecognitionSupported()) {
      setLines((prev) => [...prev, { role: 'ai', text: 'Voice input is not supported in this browser. Type instead.' }]);
      return;
    }
    // Interrupt AI speech
    if (voiceRef.current.isSpeaking()) {
      voiceRef.current.stopSpeaking();
      setAiState('interrupted');
    }
    setMicOn(true);
    setAiState('listening');
    voiceRef.current.startListening({
      onFinal: (text) => {
        setMicOn(false);
        setAiState('thinking');
        void runAsk(text);
      },
      onError: () => {
        setMicOn(false);
        setAiState('error');
      },
      onEnd: () => setMicOn(false),
    });
  };

  const quick = useMemo(() => [
    { label: 'Review matches', q: 'Which opportunities should I prioritize based on my profile?' },
    { label: 'Profile gaps', q: 'What is missing from my profile that would help recruiters?' },
    { label: 'Applications', q: 'Summarize the status of my applications and what I should do next.' },
    { label: 'Prepare', q: 'Help me prepare for interviews based on my skills and projects.' },
  ], []);

  if (!initDone) {
    return (
      <div className="stage-boot">
        <div className="stage-boot-inner">
          {INIT_LINES.slice(0, initIndex + 1).map((line, i) => (
            <p key={line} className={`stage-boot-line${i === initIndex ? ' is-current' : ''}`}>{line}</p>
          ))}
          <button type="button" className="stage-skip" onClick={skipInit}>Skip</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stage-env">
      <div className="stage-env-grid">
        {/* AI presence column */}
        <section className="stage-ai-column">
          <AIPresence state={aiState} name="Aether" />
          <div className="stage-dialogue" aria-live="polite">
            {lines.slice(-4).map((l, i) => (
              <div key={i} className={`stage-line stage-line-${l.role}`}>
                <span className="stage-line-who">{l.role === 'ai' ? 'AETHER' : 'YOU'}</span>
                <p>{l.text}</p>
              </div>
            ))}
          </div>

          <form
            className="stage-compose"
            onSubmit={(e) => {
              e.preventDefault();
              void runAsk(input);
            }}
          >
            <input
              className="stage-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Speak or type to Aether…"
              disabled={busy}
            />
            <button type="button" className="stage-icon-btn" onClick={toggleMic} title="Microphone" aria-pressed={micOn}>
              {micOn ? <Mic size={16} /> : <MicOff size={16} />}
            </button>
            <button
              type="button"
              className="stage-icon-btn"
              onClick={() => {
                if (voiceOn) voiceRef.current.stopSpeaking();
                setVoiceOn((v) => !v);
              }}
              title="Voice output"
            >
              {voiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button type="submit" className="stage-icon-btn stage-send" disabled={busy || !input.trim()}>
              <Send size={16} />
            </button>
          </form>

          <div className="stage-quick">
            {quick.map((q) => (
              <button key={q.label} type="button" className="stage-chip" onClick={() => void runAsk(q.q)} disabled={busy}>
                {q.label}
              </button>
            ))}
          </div>
        </section>

        {/* Contextual signal field */}
        <section className="stage-field">
          <p className="stage-kicker">Placement field</p>
          <h2 className="stage-heading">{profile?.full_name || 'Operator'}</h2>
          <p className="stage-sub">
            {[profile?.branch, profile?.cgpa != null ? `CGPA ${profile.cgpa}` : null].filter(Boolean).join(' · ') || 'Identity linked'}
          </p>

          <div className="stage-signal-grid">
            {signals.map((s) => (
              <div key={s.label} className="stage-signal">
                <span className="stage-signal-label">{s.label}</span>
                <span className="stage-signal-value">{s.value}</span>
                {s.meta && <span className="stage-signal-meta">{s.meta}</span>}
              </div>
            ))}
          </div>

          <div className="stage-portals">
            {([
              ['matches', 'Matches'],
              ['applications', 'Applications'],
              ['profile', 'Identity'],
              ['companies', 'Companies'],
              ['messages', 'Messages'],
              ['settings', 'Settings'],
            ] as const).map(([view, label]) => (
              <button
                key={view}
                type="button"
                className="stage-portal"
                onClick={() => onNavigate?.(view)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
