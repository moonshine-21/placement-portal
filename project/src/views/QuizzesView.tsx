import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { timeAgo } from '@/lib/data';
import {
  loadCompanyQuizzes, createQuiz, deleteQuiz, loadStudentPickerList, sendQuizToStudent,
  type QuizListItem, type QuizDraft, type StudentPick,
} from '@/lib/quiz';
import { ClipboardList, Plus, X, Trash2, Send, Search, Check } from 'lucide-react';

const EMPTY_QUESTION = () => ({ question: '', options: ['', '', '', ''], correctIndex: 0 });

export function QuizzesView() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendTarget, setSendTarget] = useState<QuizListItem | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<QuizDraft['questions']>([EMPTY_QUESTION()]);

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    setQuizzes(await loadCompanyQuizzes(profile.id));
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setQuestions([EMPTY_QUESTION()]);
    setShowForm(false);
  };

  const updateQuestion = (i: number, patch: Partial<QuizDraft['questions'][number]>) => {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  };
  const updateOption = (qi: number, oi: number, value: string) => {
    setQuestions((qs) => qs.map((q, idx) => (idx === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) } : q)));
  };

  const submit = async () => {
    if (!profile) return;
    if (!title.trim()) return showToast('Give the quiz a title.', 'error');
    for (const q of questions) {
      if (!q.question.trim() || q.options.some((o) => !o.trim())) {
        return showToast('Every question needs text and all 4 options filled in.', 'error');
      }
    }
    setSaving(true);
    const { error } = await createQuiz(profile.id, { title: title.trim(), description: description.trim(), questions });
    setSaving(false);
    if (error) return showToast('Could not create quiz: ' + error, 'error');
    showToast('Quiz created', 'success');
    resetForm();
    load();
  };

  const remove = async (quiz: QuizListItem) => {
    if (!confirm(`Delete "${quiz.title}"? This can't be undone.`)) return;
    const { error } = await deleteQuiz(quiz.id);
    if (error) return showToast('Could not delete: ' + error, 'error');
    load();
  };

  if (loading) return <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Quizzes</h2>
          <p className="text-sm text-[var(--text-muted)]">Create multiple-choice quizzes and send them to applicants over DM.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm"><Plus size={16} /> New Quiz</button>
      </div>

      {quizzes.length === 0 ? (
        <div className="card p-8 text-center text-[var(--text-muted)]">
          <ClipboardList size={28} className="mx-auto mb-2 opacity-50" />
          No quizzes yet. Create one to send to your applicants.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {quizzes.map((q) => (
            <div key={q.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{q.title}</h3>
                <button onClick={() => remove(q)} className="flex-shrink-0 rounded-lg p-1 text-[var(--text-muted)] hover:bg-rose-500/10 hover:text-rose-400">
                  <Trash2 size={15} />
                </button>
              </div>
              {q.description && <p className="text-sm text-[var(--text-secondary)]">{q.description}</p>}
              <p className="text-xs text-[var(--text-muted)]">{q.question_count} question{q.question_count === 1 ? '' : 's'} · Created {timeAgo(q.created_at)}</p>
              <button onClick={() => setSendTarget(q)} className="btn-secondary btn-sm mt-2 w-full"><Send size={14} /> Send to applicant</button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={resetForm}>
          <div className="glass max-h-[85vh] w-full max-w-lg overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">New Quiz</h3>
              <button onClick={resetForm} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <input className="input-field" placeholder="Quiz title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <textarea className="input-field" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />

              {questions.map((q, qi) => (
                <div key={qi} className="rounded-xl border border-[var(--border)] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--text-muted)]">Question {qi + 1}</span>
                    {questions.length > 1 && (
                      <button onClick={() => setQuestions((qs) => qs.filter((_, idx) => idx !== qi))} className="text-[var(--text-muted)] hover:text-rose-400">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <input className="input-field" placeholder="Question text" value={q.question} onChange={(e) => updateQuestion(qi, { question: e.target.value })} />
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuestion(qi, { correctIndex: oi })}
                        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 ${q.correctIndex === oi ? 'border-emerald-400 bg-emerald-400/20 text-emerald-400' : 'border-[var(--border)] text-transparent'}`}
                        title="Mark as correct answer"
                      >
                        <Check size={13} />
                      </button>
                      <input
                        className="input-field flex-1"
                        placeholder={`Option ${oi + 1}`}
                        value={opt}
                        onChange={(e) => updateOption(qi, oi, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              ))}

              <button onClick={() => setQuestions((qs) => [...qs, EMPTY_QUESTION()])} className="btn-ghost btn-sm w-full">
                <Plus size={14} /> Add question
              </button>

              <button onClick={submit} disabled={saving} className="btn-primary w-full">
                {saving ? 'Saving…' : 'Create Quiz'}
              </button>
            </div>
          </div>
        </div>
      )}

      {sendTarget && (
        <SendQuizModal quiz={sendTarget} onClose={() => setSendTarget(null)} />
      )}
    </div>
  );
}

function SendQuizModal({ quiz, onClose }: { quiz: QuizListItem; onClose: () => void }) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [students, setStudents] = useState<StudentPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!profile) return;
    loadStudentPickerList(profile.id).then((list) => { setStudents(list); setLoading(false); });
  }, [profile]);

  const filtered = students.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  const send = async (student: StudentPick) => {
    if (!profile) return;
    setSendingTo(student.id);
    const { error } = await sendQuizToStudent(profile.id, profile.full_name || 'A company', student.id, quiz.id, quiz.title);
    setSendingTo(null);
    if (error) return showToast('Could not send: ' + error, 'error');
    setSentTo((s) => new Set(s).add(student.id));
    showToast(`Sent to ${student.name}`, 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold">Send "{quiz.title}"</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"><X size={18} /></button>
        </div>
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input className="input-field pl-9" placeholder="Search applicants…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {loading ? (
            <div className="typing-dots"><span></span><span></span><span></span></div>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">No applicants found.</p>
          ) : (
            filtered.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-[var(--surface-hover)]">
                <span className="truncate text-sm">{s.name}</span>
                <button
                  onClick={() => send(s)}
                  disabled={sendingTo === s.id || sentTo.has(s.id)}
                  className="btn-secondary btn-sm flex-shrink-0"
                >
                  {sentTo.has(s.id) ? <><Check size={13} /> Sent</> : sendingTo === s.id ? '…' : 'Send'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
