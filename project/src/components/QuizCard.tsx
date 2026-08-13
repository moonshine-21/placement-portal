import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { ClipboardList, X, Check, XCircle } from 'lucide-react';

type Assignment = { id: string; quiz_id: string; student_id: string; company_id: string; status: 'sent' | 'in_progress' | 'completed' };
type Quiz = { id: string; title: string; description: string };
type Question = { id: string; question: string; options: string[] };
type AttemptResult = { score: number; total: number };

export function QuizCard({ assignmentId, isMine }: { assignmentId: string; isMine: boolean }) {
  const { user } = useAuth();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attempt, setAttempt] = useState<AttemptResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [taking, setTaking] = useState(false);

  const load = async () => {
    const { data: a } = await supabase.from('quiz_assignments').select('id, quiz_id, student_id, company_id, status').eq('id', assignmentId).maybeSingle();
    if (!a) { setLoading(false); return; }
    setAssignment(a as Assignment);
    const { data: q } = await supabase.from('quizzes').select('id, title, description').eq('id', a.quiz_id).maybeSingle();
    setQuiz(q as Quiz | null);
    if (a.status === 'completed') {
      const { data: att } = await supabase.from('quiz_attempts').select('score, total').eq('assignment_id', assignmentId).maybeSingle();
      if (att) setAttempt(att as AttemptResult);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [assignmentId]);

  if (loading) {
    return <div className="mt-1.5 h-16 w-56 animate-pulse rounded-xl bg-black/10" />;
  }
  if (!assignment || !quiz) {
    return <p className="mt-1.5 text-xs opacity-70">Quiz unavailable.</p>;
  }

  const isStudent = user?.id === assignment.student_id;

  return (
    <>
      <div className="mt-1.5 w-56 rounded-xl bg-black/20 p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
          <ClipboardList size={13} /> Quiz
        </div>
        <p className="text-sm font-medium">{quiz.title}</p>
        {quiz.description && <p className="mt-0.5 text-xs opacity-75">{quiz.description}</p>}

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

      {taking && (
        <QuizTakeModal
          assignment={assignment}
          quizTitle={quiz.title}
          onClose={() => setTaking(false)}
          onSubmitted={(result) => {
            setAttempt(result);
            setTaking(false);
          }}
        />
      )}
    </>
  );
}

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
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [breakdown, setBreakdown] = useState<{ question_id: string; correct: boolean; correct_index: number }[] | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);

  useEffect(() => {
    (async () => {
      // Mark as opened. Only the status column is writable per RLS.
      if (assignment.status === 'sent') {
        await supabase.from('quiz_assignments').update({ status: 'in_progress' }).eq('id', assignment.id);
      }
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

  const submit = async () => {
    if (Object.keys(answers).length < questions.length) {
      return showToast('Answer every question before submitting.', 'error');
    }
    setSubmitting(true);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={result ? undefined : onClose}>
      <div className="glass max-h-[85vh] w-full max-w-lg overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{quizTitle}</h3>
          {!result && <button onClick={onClose} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"><X size={18} /></button>}
        </div>

        {loading ? (
          <div className="typing-dots"><span></span><span></span><span></span></div>
        ) : result ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{result.score}/{result.total}</p>
              <p className="text-sm text-[var(--text-muted)]">Your score</p>
            </div>
            <div className="space-y-2">
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
          <div className="space-y-4">
            {questions.map((q, qi) => (
              <div key={q.id} className="space-y-2">
                <p className="text-sm font-medium">{qi + 1}. {q.question}</p>
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
    </div>
  );
}
