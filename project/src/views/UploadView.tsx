// ============================================================================
// src/views/UploadView.tsx
//
// WHAT THIS FILE IS: the "Upload Documents" page — lets a student
// drag-and-drop or pick ANY placement-relevant document (resume,
// marksheet/transcript, certificate, project report, cover letter…),
// sends it to /api/analyze-document for real AI (Gemini) analysis, and
// shows what it actually found: whether the file was even a valid kind
// of document in the first place, a quality score, extracted skills/CGPA,
// and concrete ways to improve it. A chat box underneath lets the student
// ask follow-up questions about what was found, answered by
// /api/document-chat with the same session's analyses as context.
//
// Multiple files can be uploaded one after another in the same session —
// each becomes its own card, newest first. The whole session (uploaded
// results + chat) is kept in sessionStorage (so it's naturally gone the
// moment the student actually leaves the site — closes the tab, closes
// the browser) AND additionally expires after 20 minutes of inactivity
// even if the tab stays open, exactly like the AI Career Assistant tab's
// own chat persistence.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { uploadPrivateFile, saveProfile } from '@/lib/data';
import { Upload, FileText, CheckCircle2, AlertTriangle, Loader2, Sparkles, Send, Bot, User as UserIcon, ChevronDown, ChevronUp } from 'lucide-react';

type DocumentAnalysis = {
  valid: boolean;
  detectedContent: string;
  documentType: string;
  summary: string;
  skills: string[];
  cgpa: string | null;
  score: number | null;
  strengths: string[];
  improvements: string[];
};

type UploadResult = {
  id: string;
  filename: string;
  analysis: DocumentAnalysis | null; // null = analysis call itself failed (network/server issue, not "invalid document")
  error?: string;
};

type ChatMessage = { role: 'bot' | 'user'; text: string };

const SESSION_KEY = 'upload_documents_session';
const INACTIVITY_TTL_MS = 20 * 60 * 1000; // 20 minutes, per the "reset after inactivity" requirement

const WELCOME_MESSAGE: ChatMessage = {
  role: 'bot',
  text: "Upload a resume, marksheet, certificate, or other document above and I'll break down what's in it, score it, and tell you exactly how to make it stronger. Once something's analyzed, ask me anything about it.",
};

// Formats that Gemini can look at directly (see VISION_MIME_TYPES on the
// server) — everything else falls back to a crude client-side text scrape.
const VISION_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']);

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip the "data:<mime>;base64," prefix — the server only wants the raw payload
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Last-resort plain-text scrape for formats Gemini can't see directly
// (.doc, .docx have no safe/simple browser-side parser here) — the server
// prompt is told this text may be incomplete/garbled and to judge it
// honestly rather than penalize the scrape's own limitations.
async function crudeTextScrape(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'txt' || ext === 'md' || ext === 'csv') return await file.text();
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let raw = '';
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i];
      if (c >= 32 && c < 127) raw += String.fromCharCode(c);
      else if (c === 10 || c === 13 || c === 9) raw += ' ';
    }
    return raw;
  } catch {
    return '';
  }
}

// Minimal Markdown-ish → HTML formatter for chat replies (bold + bullets),
// same idea as AIAssistantView's formatAIText, kept small and local here
// since this page's chat is a separate, lighter-weight surface.
function formatReply(raw: string): string {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inList = false;
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
  for (const line of lines) {
    const bullet = line.match(/^\s*[*\-•]\s+(.*)/);
    if (bullet) {
      if (!inList) { out.push('<ul class="ai-list">'); inList = true; }
      out.push(`<li>${bullet[1]}</li>`);
    } else {
      closeList();
      if (line.trim()) out.push(`<p>${line}</p>`);
    }
  }
  closeList();
  let html = out.join('');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<![*\w])\*(?!\*)/g, '');
  return html;
}

type SessionShape = { results: UploadResult[]; chat: ChatMessage[]; updatedAt: number };

function loadSession(): SessionShape | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionShape;
    if (!parsed?.updatedAt || Date.now() - parsed.updatedAt > INACTIVITY_TTL_MS) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persistSession(results: UploadResult[], chat: ChatMessage[]) {
  try {
    if (results.length === 0 && chat.length <= 1) {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ results, chat, updatedAt: Date.now() }));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function UploadView() {
  const { profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<UploadResult[]>(() => loadSession()?.results || []);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>(() => {
    const saved = loadSession()?.chat;
    return saved && saved.length > 0 ? saved : [WELCOME_MESSAGE];
  });
  const [chatInput, setChatInput] = useState('');
  const [chatTyping, setChatTyping] = useState(false);
  const chatBodyRef = useRef<HTMLDivElement>(null);

  // Keep the freshest result expanded and, once at least one document has
  // been analyzed, drop the generic welcome-only chat.
  useEffect(() => {
    if (results.length > 0) setExpandedId(results[0].id);
  }, [results.length]);

  // Persist on every change (refreshes the inactivity clock too).
  useEffect(() => {
    persistSession(results, chat);
  }, [results, chat]);

  // "Leaves the site" reset: sessionStorage already clears itself when the
  // tab/browser actually closes, but if they navigate away within the same
  // tab and come back later than the inactivity window allows, the load-time
  // TTL check in loadSession() above handles that. This effect additionally
  // clears state immediately if the tab is hidden for long enough that it
  // would already be stale on return, so a background tab doesn't keep
  // stale state alive indefinitely in memory.
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > INACTIVITY_TTL_MS) {
        setResults([]);
        setChat([WELCOME_MESSAGE]);
        sessionStorage.removeItem(SESSION_KEY);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
  }, [chat, chatTyping]);

  const handleFile = async (file: File) => {
    if (!profile) return;
    setAnalyzing(true);

    // Upload the raw file to private storage regardless of what the
    // analysis finds — keeping the file on record is worth doing even for
    // a rejected/invalid upload (the student may want to revisit why it
    // was rejected, or a placement officer may want to see what was tried).
    const path = await uploadPrivateFile('resumes', file, profile.id);
    if (!path) {
      showToast('Upload failed', 'error');
      setAnalyzing(false);
      return;
    }

    const id = `${Date.now()}-${file.name}`;
    let analysis: DocumentAnalysis | null = null;
    let errorMsg: string | undefined;

    try {
      const isVision = VISION_TYPES.has(file.type);
      const reqBody: Record<string, unknown> = { filename: file.name };
      if (isVision) {
        reqBody.mimeType = file.type;
        reqBody.fileBase64 = await fileToBase64(file);
      } else {
        reqBody.extractedText = await crudeTextScrape(file);
      }
      const res = await fetch('/api/analyze-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      const data = await res.json();
      if (data.ok && data.analysis) {
        analysis = data.analysis as DocumentAnalysis;
      } else {
        errorMsg = data.error || 'Could not analyze this file.';
      }
    } catch {
      errorMsg = 'Could not reach the analyzer — check your connection and try again.';
    }

    const result: UploadResult = { id, filename: file.name, analysis, error: errorMsg };
    setResults((prev) => [result, ...prev]);

    // Only touch the profile for a genuinely valid document that actually
    // yielded skills/CGPA — never for a rejected/irrelevant upload, and
    // never invent data that wasn't really found.
    if (analysis?.valid && (analysis.skills.length > 0 || analysis.cgpa)) {
      await saveProfile(profile.id, profile.email, {
        resume_filename: file.name,
        resume_text: analysis.summary || file.name,
        skills: [...new Set([...(profile.skills || []), ...analysis.skills])],
        ...(analysis.cgpa ? { cgpa: parseFloat(analysis.cgpa) } : {}),
      });
      await refreshProfile();
    }

    setAnalyzing(false);

    if (!analysis) {
      showToast(errorMsg || 'Analysis failed', 'error');
    } else if (!analysis.valid) {
      showToast("That doesn't look like a resume, marksheet, or similar document — see the details below.", 'info');
    } else {
      showToast('Analysis complete', 'success');
    }

    // Nudge the chat to acknowledge the new upload without demanding the
    // student type anything themselves.
    setChat((prev) => [
      ...prev,
      {
        role: 'bot',
        text: !analysis
          ? `I couldn't analyze "${file.name}" — ${errorMsg}`
          : !analysis.valid
            ? `I looked at "${file.name}" — ${analysis.detectedContent} That's not something I can score as a placement document. Please upload a resume, marksheet, certificate, or similar file instead.`
            : `I've gone through "${file.name}" — it looks like a ${analysis.documentType.replace('_', ' ')}${analysis.score !== null ? `, and I'd rate it ${analysis.score}/100` : ''}. Check the card above for the full breakdown, or ask me anything about it.`,
      },
    ]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach((f) => handleFile(f));
  };

  const sendChat = async (text?: string) => {
    const question = (text ?? chatInput).trim();
    if (!question) return;
    setChat((prev) => [...prev, { role: 'user', text: question }]);
    setChatInput('');
    setChatTyping(true);
    try {
      const res = await fetch('/api/document-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          documents: results.map((r) => ({
            filename: r.filename,
            documentType: r.analysis?.documentType,
            score: r.analysis?.score,
            skills: r.analysis?.skills,
            cgpa: r.analysis?.cgpa,
            strengths: r.analysis?.strengths,
            improvements: r.analysis?.improvements,
            summary: r.analysis?.summary,
          })),
          history: chat.slice(-8),
        }),
      });
      const data = await res.json();
      if (data.ai && data.reply) {
        setChat((prev) => [...prev, { role: 'bot', text: formatReply(data.reply) }]);
      } else {
        setChat((prev) => [...prev, { role: 'bot', text: "I'm having trouble reaching the AI service right now — please try again in a moment." }]);
      }
    } catch {
      setChat((prev) => [...prev, { role: 'bot', text: "I couldn't reach the AI service — check your connection and try again." }]);
    }
    setChatTyping(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Upload Documents</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Upload your documents — resume, marksheet, reports, certificates, and more. Our AI reads what you actually
          uploaded, scores it, and tells you exactly how to improve it.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
            dragging ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border-strong)] hover:border-[var(--accent)]'
          }`}
        >
          {analyzing ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
              <p className="text-sm text-[var(--text-secondary)]">Analyzing document…</p>
            </div>
          ) : (
            <>
              <Upload size={36} className="mx-auto mb-3 text-[var(--text-muted)]" />
              <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Drag & drop your documents here</p>
              <p className="text-xs text-[var(--text-muted)] mb-4">Resume, marksheet, reports, certificates — PDF, image, DOC, DOCX, or TXT</p>
              <label className="btn-primary btn-sm cursor-pointer inline-flex">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = ''; // allow re-selecting the same file, or picking another right after
                  }}
                />
                Choose file
              </label>
              <p className="mt-3 text-[11px] text-[var(--text-muted)]">You can upload more documents any time — each one gets its own analysis below.</p>
            </>
          )}
        </div>

        {/* Every uploaded document this session, newest first. */}
        {results.length > 0 && (
          <div className="mt-6 space-y-3">
            {results.map((r) => {
              const a = r.analysis;
              const expanded = expandedId === r.id;
              return (
                <div
                  key={r.id}
                  className={`rounded-2xl border p-4 animate-fade-in ${
                    !a ? 'border-rose-400/30 bg-rose-500/10' : a.valid ? 'border-emerald-400/30 bg-emerald-500/10' : 'border-amber-400/30 bg-amber-500/10'
                  }`}
                >
                  <button onClick={() => setExpandedId(expanded ? null : r.id)} className="flex w-full items-center justify-between gap-3 text-left">
                    <div className="flex items-center gap-2 min-w-0">
                      {!a ? (
                        <AlertTriangle size={18} className="flex-shrink-0 text-rose-400" />
                      ) : a.valid ? (
                        <CheckCircle2 size={18} className="flex-shrink-0 text-emerald-400" />
                      ) : (
                        <AlertTriangle size={18} className="flex-shrink-0 text-amber-400" />
                      )}
                      <span className={`font-medium truncate ${!a ? 'text-rose-300' : a.valid ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {!a ? 'Analysis failed' : a.valid ? 'Analysis complete' : 'Not a placement document'}
                      </span>
                      {a?.valid && a.score !== null && (
                        <span className="flex-shrink-0 rounded-md bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
                          {a.score}/100
                        </span>
                      )}
                    </div>
                    {expanded ? <ChevronUp size={16} className="flex-shrink-0 text-[var(--text-muted)]" /> : <ChevronDown size={16} className="flex-shrink-0 text-[var(--text-muted)]" />}
                  </button>

                  {expanded && (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm text-[var(--text-secondary)]">
                        <FileText size={14} className="inline mr-1" />
                        {r.filename}
                      </p>

                      {!a && <p className="text-sm text-[var(--text-secondary)]">{r.error}</p>}

                      {a && !a.valid && (
                        <p className="text-sm text-[var(--text-secondary)]">
                          {a.detectedContent || 'This file doesn\'t look like a resume, marksheet, or other placement-relevant document.'}{' '}
                          Please upload a proper resume, marksheet, certificate, or similar document instead.
                        </p>
                      )}

                      {a?.valid && (
                        <>
                          {a.summary && <p className="text-sm text-[var(--text-secondary)]">{a.summary}</p>}
                          {a.cgpa && <p className="text-sm text-[var(--text-secondary)]">Detected CGPA: <strong>{a.cgpa}</strong></p>}
                          {a.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {a.skills.map((s) => (
                                <span key={s} className="rounded-md bg-[var(--accent)]/15 px-2 py-0.5 text-xs font-medium text-[var(--accent)]">{s}</span>
                              ))}
                            </div>
                          )}
                          {a.strengths.length > 0 && (
                            <div className="pt-1">
                              <p className="text-xs font-semibold text-emerald-400 mb-1">Strengths</p>
                              <ul className="list-disc list-inside space-y-0.5 text-sm text-[var(--text-secondary)]">
                                {a.strengths.map((s, i) => <li key={i}>{s}</li>)}
                              </ul>
                            </div>
                          )}
                          {a.improvements.length > 0 && (
                            <div className="pt-1">
                              <p className="text-xs font-semibold text-amber-400 mb-1">How to improve</p>
                              <ul className="list-disc list-inside space-y-0.5 text-sm text-[var(--text-secondary)]">
                                {a.improvements.map((s, i) => <li key={i}>{s}</li>)}
                              </ul>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------- AI document chat ---------- */}
      <div className="glass flex h-[32rem] flex-col overflow-hidden rounded-2xl">
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">AI Career Assistant</span>
              <span className="rounded-md bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">AI</span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">Ask about anything you've uploaded</p>
          </div>
        </div>

        <div ref={chatBodyRef} className="flex-1 overflow-y-auto scroll-thin p-4 space-y-3">
          {chat.map((m, i) => (
            <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
              {m.role === 'bot' && (
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]">
                  <Bot size={14} className="text-white" />
                </div>
              )}
              <div
                className={`ai-rich-text max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white rounded-br-md'
                    : 'bg-[var(--surface-hover)] text-[var(--text-primary)] rounded-bl-md border border-[var(--border)]'
                }`}
                dangerouslySetInnerHTML={{ __html: m.role === 'bot' ? m.text : m.text.replace(/</g, '&lt;') }}
              />
              {m.role === 'user' && (
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--surface)] border border-[var(--border-strong)]">
                  <UserIcon size={14} className="text-[var(--text-secondary)]" />
                </div>
              )}
            </div>
          ))}
          {chatTyping && (
            <div className="flex gap-2.5 animate-fade-in">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]">
                <Bot size={14} className="text-white" />
              </div>
              <div className="rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface-hover)] px-3.5 py-2.5">
                <div className="typing-dots"><span></span><span></span><span></span></div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border)] p-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
              placeholder="Ask about your uploaded documents…"
              className="input-field flex-1"
            />
            <button onClick={() => sendChat()} disabled={!chatInput.trim()} className="btn-primary h-10 w-10 !px-0 flex-shrink-0">
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
