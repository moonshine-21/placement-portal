// ============================================================================
// src/components/QuizCard.tsx
//
// WHAT THIS FILE IS: the interactive quiz widget shown inside a DM
// message thread, whenever a company sends a quiz to a student (see
// src/lib/quiz.ts's sendQuizToStudent and api/bot-evaluate-application.ts,
// both of which create a message with attachment_type='quiz' — this
// component is what MessagesView.tsx renders for that specific
// attachment type). It has two parts: a small compact "card" preview
// (QuizCard itself) and, once the student clicks to start it, a bigger
// popup (QuizTakeModal) where they actually answer the questions.
// ============================================================================

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { ClipboardList, X, Check, XCircle } from 'lucide-react';

// Local type definitions, matching (a subset of) the database columns —
// see the Quiz-related tables described in supabase/setup.sql.
type Assignment = { id: string; quiz_id: string; student_id: string; company_id: string; status: 'sent' | 'in_progress' | 'completed' };
type Quiz = { id: string; title: string; description: string };
type Question = { id: string; question: string; options: string[] };
type AttemptResult = { score: number; total: number };

// `assignmentId` identifies WHICH quiz-send this card represents (from
// the chat message's attachment_url — see src/lib/quiz.ts). `isMine`
// tells this card whether the CURRENT viewer is the company who SENT this
// quiz (true) or the student who's meant to take it (false) — used purely
// for wording the "not started yet" status message differently for each side.
export function QuizCard({ assignmentId, isMine }: { assignmentId: string; isMine: boolean }) {
  const { user } = useAuth();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attempt, setAttempt] = useState<AttemptResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [taking, setTaking] = useState(false); // is the full quiz-taking popup currently open?

  // Loads everything needed to display the compact card: the assignment
  // itself, the quiz's title/description, and — if it's already been
  // completed — the final score.
  const load = async () => {
    const { data: a } = await supabase.from('quiz_assignments').select('id, quiz_id, student_id, company_id, status').eq('id', assignmentId).maybeSingle();
    if (!a) { setLoading(false); return; }
    setAssignment(a as Assignment);
    const { data: q } = await supabase.from('quizzes').select('id, title, description').eq('id', a.quiz_id).maybeSingle();
    setQuiz(q as Quiz | null);
    if (a.status === 'completed') {
      // Note: this reads the SCORE from `quiz_attempts`, but never the
      // answer key itself — that table (`quiz_answer_keys`) has no RLS
      // policy letting a student's browser read it at all, even after
      // completing the quiz (see api/quiz-submit.ts's comments for why).
      const { data: att } = await supabase.from('quiz_attempts').select('score, total').eq('assignment_id', assignmentId).maybeSingle();
      if (att) setAttempt(att as AttemptResult);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [assignmentId]);

  if (loading) {
    // A simple pulsing gray placeholder box, roughly the size of the real
    // card, while data loads.
    return <div className="mt-1.5 h-16 w-56 animate-pulse rounded-xl bg-black/10" />;
  }
  if (!assignment || !quiz) {
    return <p className="mt-1.5 text-xs opacity-70">Quiz unavailable.</p>;
  }

  // Is the CURRENT logged-in viewer specifically the student this quiz
  // was assigned to? (As opposed to the company who sent it, viewing
  // their own sent message.)
  const isStudent = user?.id === assignment.student_id;

  return (
    <>
      {/* The compact card shown inline in the chat message. */}
      <div className="mt-1.5 w-56 rounded-xl bg-black/20 p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
          <ClipboardList size={13} /> Quiz
        </div>
        <p className="text-sm font-medium">{quiz.title}</p>
        {quiz.description && <p className="mt-0.5 text-xs opacity-75">{quiz.description}</p>}

        {/* Three possible states shown here: already completed (show
            score), the student viewing it before taking it (show a
            Start/Continue button), or the company viewing their own sent
            quiz (just a status line, no button — they can't take their
            own quiz). */}
        {attempt ? (
          <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold">
            <Check size={13} className="text-emerald-400" /> Scored {attempt.score}/{attempt.total}
          </div>
        ) : isStudent ? (
          <button onClick={() => setTaking(true)} className="btn-primary btn-sm mt-2 w-full">
            {assignment.status === 'in_progress' ? 'Continue Quiz' : 'Start Quiz'}
          </button>
        ) : (
          <p className="mt-2 text-xs opacity-70">{assignment.status === 'completed' ? 'Completed' : isMine ? 'Waiting for response' : 'Not started'}</p>
        )}
      </div>

      {/* Only mount the full quiz-taking popup while `taking` is true. */}
      {taking && (
        <QuizTakeModal
          assignment={assignment}
          quizTitle={quiz.title}
          onClose={() => setTaking(false)}
          onSubmitted={(result) => {
            // Once submitted, remember the score locally (so the compact
            // card immediately reflects "completed" without needing to
            // re-fetch from the server) and close the popup.
            setAttempt(result);
            setTaking(false);
          }}
        />
      )}
    </>
  );
}

// The full-screen popup where a student actually answers each question,
// one at a time (all shown together on one scrollable screen, in this
// case, rather than one-question-per-screen).
function QuizTakeModal({
  assignment, quizTitle, onClose, onSubmitted,
}: {
  assignment: Assignment;
  quizTitle: string;
  onClose: () => void;
  onSubmitted: (result: AttemptResult) => void;
}) {
  const { showToast } = useToast();
  const [questions, setQuestions] = useState<Question[]>([]);
  // A lookup table: { question_id: which option index the student picked }
  // — built up as they click through the questions.
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // After submitting, the server sends back a full breakdown of which
  // answers were right/wrong (see api/quiz-submit.ts) — stored here to
  // show the review screen.
  const [breakdown, setBreakdown] = useState<{ question_id: string; correct: boolean; correct_index: number }[] | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);

  useEffect(() => {
    (async () => {
      // Mark as opened. Only the status column is writable per RLS.
      // (The moment they open the quiz for the first time, flip its
      // status from 'sent' to 'in_progress', so the company can see
      // "they've started it" even before it's finished.)
      if (assignment.status === 'sent') {
        await supabase.from('quiz_assignments').update({ status: 'in_progress' }).eq('id', assignment.id);
      }
      // Fetch the actual questions (WITHOUT the correct answers — those
      // are only ever revealed server-side, after submission).
      const { data } = await supabase
        .from('quiz_questions')
        .select('id, question, options')
        .eq('quiz_id', assignment.quiz_id)
        .order('position', { ascending: true });
      setQuestions((data as Question[]) || []);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment.id]);

  // Submits the student's answers to be graded — always via the server
  // (api/quiz-submit.ts), never graded locally, since the correct answers
  // never even reach this browser.
  const submit = async () => {
    if (Object.keys(answers).length < questions.length) {
      return showToast('Answer every question before submitting.', 'error');
    }
    setSubmitting(true);
    // Grab the current login token to prove who's submitting (see the
    // matching check in api/quiz-submit.ts).
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    try {
      const res = await fetch('/api/quiz-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ assignment_id: assignment.id, answers }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || 'Could not submit quiz.', 'error');
        setSubmitting(false);
        return;
      }
      setResult({ score: json.score, total: json.total });
      setBreakdown(json.breakdown);
    } catch {
      showToast('Could not reach the server. Please try again.', 'error');
    }
    setSubmitting(false);
  };

  return createPortal(
    // Notice `onClick={result ? undefined : onClose}` — clicking the
    // backdrop only closes the modal BEFORE a result exists; once
    // they've submitted and are viewing their score/review, we don't want
    // an accidental outside click to dismiss the results before they've
    // read them (they have to press the explicit "Done" button instead).
    // Portaled to document.body for the same reason as QuizzesView.tsx's
    // modals — AppShell wraps every page in an `animate-fade-in` div
    // whose CSS animation sets a `transform`, which traps any
    // `position: fixed` descendant inside that div's box instead of the
    // real viewport. Escaping via a portal keeps `fixed inset-0` meaning
    // what it says: the whole screen.
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={result ? undefined : onClose}>
      <div className="modal-panel max-h-[85vh] w-full max-w-lg overflow-y-auto scroll-thin p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{quizTitle}</h3>
          {/* Hide the X close button once they have a result — same
              reasoning as above, force them to click "Done." */}
          {!result && <button onClick={onClose} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"><X size={18} /></button>}
        </div>

        {loading ? (
          <div className="typing-dots"><span></span><span></span><span></span></div>
        ) : result ? (
          // ---------- Results / review screen ----------
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{result.score}/{result.total}</p>
              <p className="text-sm text-[var(--text-muted)]">Your score</p>
            </div>
            <div className="space-y-2">
              {/* Show every question again, this time marked right/wrong,
                  with the correct answer revealed for anything missed. */}
              {questions.map((q) => {
                const b = breakdown?.find((x) => x.question_id === q.id);
                return (
                  <div key={q.id} className="rounded-lg border border-[var(--border)] p-2.5 text-sm">
                    <div className="flex items-start gap-1.5">
                      {b?.correct ? <Check size={14} className="mt-0.5 flex-shrink-0 text-emerald-400" /> : <XCircle size={14} className="mt-0.5 flex-shrink-0 text-rose-400" />}
                      <div>
                        <p>{q.question}</p>
                        {!b?.correct && b && <p className="mt-0.5 text-xs text-[var(--text-muted)]">Correct answer: {q.options[b.correct_index]}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={() => onSubmitted(result)} className="btn-primary w-full">Done</button>
          </div>
        ) : (
          // ---------- Question-answering screen ----------
          <div className="space-y-4">
            {questions.map((q, qi) => (
              <div key={q.id} className="space-y-2">
                <p className="text-sm font-medium">{qi + 1}. {q.question}</p>
                {/* Each option is its own clickable button styled as a
                    radio-button choice (a filled dot when selected). */}
                {q.options.map((opt, oi) => (
                  <button
                    key={oi}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      answers[q.id] === oi ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${answers[q.id] === oi ? 'border-[var(--accent)]' : 'border-[var(--border)]'}`}>
                      {answers[q.id] === oi && <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />}
                    </span>
                    {opt}
                  </button>
                ))}
              </div>
            ))}
            <button onClick={submit} disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Submitting…' : 'Submit Quiz'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
