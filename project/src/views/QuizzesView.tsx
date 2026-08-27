// ============================================================================
// src/views/QuizzesView.tsx
//
// WHAT THIS FILE IS: the company-side "manage my quizzes" page — build a
// multiple-choice quiz with a proper builder UI, see all your saved
// quizzes, delete them, and send one to a specific applicant over DM.
// All the actual database logic lives in src/lib/quiz.ts; this file is
// purely the UI wrapped around it.
//
// This file exports TWO components: the main `QuizzesView`, and a smaller
// helper `SendQuizModal` used only by this file (not exported, not used
// anywhere else) — kept in the same file since it's tightly coupled to
// QuizzesView's own state (which quiz is being sent).
// ============================================================================

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { timeAgo } from '@/lib/data';
import {
  loadCompanyQuizzes, createQuiz, deleteQuiz, loadStudentPickerList, sendQuizToStudent,
  loadQuizAssignmentStatuses, loadQuizResults,
  type QuizListItem, type QuizDraft, type StudentPick, type QuizResultRow,
} from '@/lib/quiz';
import { ClipboardList, Plus, X, Trash2, Send, Search, Check, BarChart3 } from 'lucide-react';

// A factory function (not a plain constant!) for a blank question — using
// a function here, called fresh each time, matters because otherwise
// every "new question" added to the form would share the exact same
// `options` array in memory, and editing one question's options would
// accidentally edit ALL of them at once.
const EMPTY_QUESTION = () => ({ question: '', options: ['', '', '', ''], correctIndex: 0 });

export function QuizzesView() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false); // is the "build a new quiz" popup open?
  const [saving, setSaving] = useState(false);
  const [sendTarget, setSendTarget] = useState<QuizListItem | null>(null); // which quiz's "send to applicant" popup is open, if any
  const [resultsTarget, setResultsTarget] = useState<QuizListItem | null>(null); // which quiz's "results" popup is open, if any
  const [deleteTarget, setDeleteTarget] = useState<QuizListItem | null>(null); // which quiz's delete confirmation popup is open, if any
  const [deleting, setDeleting] = useState(false);

  // The in-progress new-quiz form's data.
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

  // Updates ONE field of ONE specific question, without touching any of
  // the others. `Partial<...>` means "an object with only SOME of a
  // question's fields" — e.g. calling `updateQuestion(2, { question: 'new text' })`
  // only changes question #2's text, leaving its options/correctIndex untouched.
  //
  // `.map((q, idx) => idx === i ? { ...q, ...patch } : q)` walks every
  // question in the list; for the ONE matching index `i`, it builds a new
  // object merging the old question with the patch; every other question
  // passes through completely unchanged. This "map and only replace the
  // matching one" pattern is the standard React way to update one item in
  // an array of state, since React requires a brand new array/object
  // reference to notice something changed.
  const updateQuestion = (i: number, patch: Partial<QuizDraft['questions'][number]>) => {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  };
  // Same idea, one level deeper — updates a single OPTION's text within a
  // single QUESTION, without touching any other question or any other
  // option of that same question.
  const updateOption = (qi: number, oi: number, value: string) => {
    setQuestions((qs) => qs.map((q, idx) => (idx === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) } : q)));
  };

  // Validates and saves the whole quiz.
  const submit = async () => {
    if (!profile) return;
    if (!title.trim()) return showToast('Give the quiz a title.', 'error');
    // Check EVERY question before saving anything — a partially-filled
    // quiz shouldn't be allowed to save at all.
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
    setDeleting(true);
    const { error } = await deleteQuiz(quiz.id);
    setDeleting(false);
    if (error) return showToast('Could not delete: ' + error, 'error');
    setQuizzes((qs) => qs.filter((q) => q.id !== quiz.id));
    showToast('Quiz deleted', 'info');
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
                <button onClick={() => setDeleteTarget(q)} className="flex-shrink-0 rounded-lg p-1 text-[var(--text-muted)] hover:bg-rose-500/10 hover:text-rose-400">
                  <Trash2 size={15} />
                </button>
              </div>
              {q.description && <p className="text-sm text-[var(--text-secondary)]">{q.description}</p>}
              <p className="text-xs text-[var(--text-muted)]">{q.question_count} question{q.question_count === 1 ? '' : 's'} · Created {timeAgo(q.created_at)}</p>
              <div className="flex gap-2">
                <button onClick={() => setSendTarget(q)} className="btn-secondary btn-sm mt-2 flex-1"><Send size={14} /> Send to applicant</button>
                <button onClick={() => setResultsTarget(q)} className="btn-ghost btn-sm mt-2 flex-1"><BarChart3 size={14} /> Results</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- "Build a new quiz" popup ---------- */}
      {/* Rendered through a portal straight to document.body — NOT left
          in its normal spot in the tree. Reason: this component lives
          inside AppShell's page-transition wrapper
          (`<div className="animate-fade-in">`), and that wrapper's CSS
          animation sets a `transform`. Per the CSS spec, ANY ancestor
          with a `transform` (even a finished/idle one) becomes the
          "containing block" for `position: fixed` descendants instead of
          the real browser viewport. Without the portal, this modal's
          `fixed inset-0` would size itself to that wrapper's content box
          — not the actual screen — so it wouldn't cover the sidebar or
          header at all, letting them paint on top of it. Portaling to
          `document.body` escapes that wrapper entirely, so `fixed` means
          the real viewport again, like it's supposed to. */}
      {showForm && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={resetForm}>
          <div className="modal-panel max-h-[85vh] w-full max-w-lg overflow-y-auto scroll-thin p-6" onClick={(e) => e.stopPropagation()}>
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
                    {/* Only show the delete-question button if there's
                        MORE than one question — a quiz always needs at
                        least one, so the very last remaining question
                        can't be removed. */}
                    {questions.length > 1 && (
                      <button onClick={() => setQuestions((qs) => qs.filter((_, idx) => idx !== qi))} className="text-[var(--text-muted)] hover:text-rose-400">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <input className="input-field" placeholder="Question text" value={q.question} onChange={(e) => updateQuestion(qi, { question: e.target.value })} />
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      {/* The little checkmark circle IS the "mark this
                          option as correct" control — clicking any
                          option's circle sets THIS question's
                          correctIndex to that option's position. Only
                          the currently-correct one shows filled/green. */}
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
        </div>,
        document.body
      )}

      {/* The "send to applicant" popup is its own separate small
          component, defined below, only rendered while `sendTarget` is set. */}
      {sendTarget && (
        <SendQuizModal quiz={sendTarget} onClose={() => setSendTarget(null)} />
      )}

      {/* The "results" popup — who this quiz has been sent to and how
          they scored, defined below. */}
      {resultsTarget && (
        <QuizResultsModal quiz={resultsTarget} onClose={() => setResultsTarget(null)} />
      )}

      {/* The app's own delete-confirmation popup — same pattern used in
          MessagesView/JobsView — instead of the browser's native
          window.confirm(), which renders as plain OS chrome stamped with
          the site's raw URL rather than looking like part of the app. */}
      {deleteTarget && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-5 shadow-xl animate-fade-in-scale"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-[var(--text-primary)]">Delete "{deleteTarget.title}"?</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">This can't be undone.</p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="btn-ghost btn-sm">
                Cancel
              </button>
              <button
                disabled={deleting}
                onClick={() => { const q = deleteTarget; setDeleteTarget(null); remove(q); }}
                className="flex items-center gap-1.5 rounded-xl bg-rose-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-60"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// A small popup listing this company's applicants (see
// src/lib/quiz.ts's loadStudentPickerList), with a search box and a
// per-person "Send" button that sends the given quiz to them.
function SendQuizModal({ quiz, onClose }: { quiz: QuizListItem; onClose: () => void }) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [students, setStudents] = useState<StudentPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null); // which student's Send button is currently mid-click
  // Which students already have an assignment for THIS quiz, and what
  // state it's in — loaded straight from the database (not just
  // remembered for this modal session), so reopening this dialog later
  // still correctly shows "Sent" / "Completed" instead of letting the
  // company re-send and create a duplicate assignment (see the comment on
  // sendQuizToStudent in src/lib/quiz.ts for why that mattered).
  const [statusByStudent, setStatusByStudent] = useState<Record<string, 'sent' | 'in_progress' | 'completed'>>({});

  useEffect(() => {
    if (!profile) return;
    Promise.all([
      loadStudentPickerList(profile.id),
      loadQuizAssignmentStatuses(quiz.id),
    ]).then(([list, statuses]) => {
      setStudents(list);
      setStatusByStudent(statuses);
      setLoading(false);
    });
  }, [profile, quiz.id]);

  // Simple case-insensitive name filter, recalculated on every render
  // (fine here since the list is small — this doesn't need memoization).
  const filtered = students.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  const send = async (student: StudentPick) => {
    if (!profile) return;
    setSendingTo(student.id);
    const { error, alreadySent, existingStatus } = await sendQuizToStudent(profile.id, profile.full_name || 'A company', student.id, quiz.id, quiz.title);
    setSendingTo(null);
    if (error) return showToast('Could not send: ' + error, 'error');
    if (alreadySent) {
      // Nothing new was created — just make sure the button reflects the
      // real, already-existing state instead of quietly doing nothing.
      setStatusByStudent((s) => ({ ...s, [student.id]: existingStatus || 'sent' }));
      showToast(`${student.name} already has this quiz${existingStatus === 'completed' ? ' (completed)' : ''}.`, 'info');
      return;
    }
    setStatusByStudent((s) => ({ ...s, [student.id]: 'sent' }));
    showToast(`Sent to ${student.name}`, 'success');
  };

  const buttonLabel = (status: 'sent' | 'in_progress' | 'completed' | undefined) => {
    if (status === 'completed') return <><Check size={13} /> Completed</>;
    if (status === 'in_progress') return <><Check size={13} /> In progress</>;
    if (status === 'sent') return <><Check size={13} /> Sent</>;
    return 'Send';
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="modal-panel w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
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
            filtered.map((s) => {
              const status = statusByStudent[s.id];
              return (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-[var(--surface-hover)]">
                  <span className="truncate text-sm">{s.name}</span>
                  <button
                    onClick={() => send(s)}
                    disabled={sendingTo === s.id || !!status}
                    className="btn-secondary btn-sm flex-shrink-0"
                  >
                    {sendingTo === s.id ? '…' : buttonLabel(status)}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// A small popup showing everyone a quiz has been sent to, and — for
// anyone who's finished it — their score. This is what makes a company's
// own quiz results actually visible somewhere; previously a submitted
// attempt was recorded in the database but never surfaced anywhere on the
// company side.
function QuizResultsModal({ quiz, onClose }: { quiz: QuizListItem; onClose: () => void }) {
  const [results, setResults] = useState<QuizResultRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQuizResults(quiz.id).then((r) => { setResults(r); setLoading(false); });
  }, [quiz.id]);

  const statusLabel = (r: QuizResultRow) => {
    if (r.status === 'completed') return null; // score is shown separately for completed rows
    if (r.status === 'in_progress') return <span className="text-xs font-medium text-amber-400">In progress</span>;
    return <span className="text-xs font-medium text-[var(--text-muted)]">Not started</span>;
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="modal-panel max-h-[80vh] w-full max-w-md overflow-y-auto scroll-thin p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold">Results — "{quiz.title}"</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"><X size={18} /></button>
        </div>
        {loading ? (
          <div className="typing-dots"><span></span><span></span><span></span></div>
        ) : results.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">This quiz hasn't been sent to anyone yet.</p>
        ) : (
          <div className="space-y-2">
            {results.map((r) => (
              <div key={r.assignment_id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5">
                <span className="truncate text-sm font-medium">{r.student_name}</span>
                {r.status === 'completed' && r.score !== null ? (
                  <span className="flex-shrink-0 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                    {r.score}/{r.total}
                  </span>
                ) : statusLabel(r)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
