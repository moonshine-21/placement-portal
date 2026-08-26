// ============================================================================
// src/lib/quiz.ts
//
// WHAT THIS FILE IS: all the database logic for a COMPANY managing quizzes
// — creating them, listing them, deleting them, and sending one to a
// specific student as a DM message. This is client-side code (it runs in
// the company's browser, using their own login permissions, protected by
// database-level rules), which is fine here because a company is only
// ever allowed to touch its OWN quizzes (see the RLS policies on
// `quizzes`/`quiz_questions`/etc in supabase/setup.sql). Compare this to
// api/bot-evaluate-application.ts, which does very similar quiz-creation
// work but MUST run on the server, because a bot company has no browser
// of its own sending requests.
// ============================================================================

import { supabase } from './supabase';

// The shape of a quiz while it's still being built in the UI, before it's
// saved to the database — a title, description, and a list of questions,
// each with 2+ text options and which option index (0, 1, 2, ...) is correct.
export type QuizDraft = {
  title: string;
  description: string;
  questions: { question: string; options: string[]; correctIndex: number }[];
};

// A lightweight summary of an already-saved quiz, used for showing a list
// of a company's quizzes (we don't need the full questions/answers just to
// display a list — that would be wasteful).
export type QuizListItem = {
  id: string;
  title: string;
  description: string;
  created_at: string;
  question_count: number; // how many questions it has, calculated below
};

// Fetches every quiz a company has created, with a question count on each.
export async function loadCompanyQuizzes(companyId: string): Promise<QuizListItem[]> {
  const { data: quizzes } = await supabase
    .from('quizzes')
    .select('id, title, description, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false }); // newest first
  if (!quizzes) return [];

  // The `quizzes` table doesn't store a question count directly — we have
  // to separately fetch every question row belonging to any of these
  // quizzes, then count them ourselves. `.in('quiz_id', [...])` means
  // "where quiz_id is one of these IDs" — one single database query
  // instead of looping and querying once per quiz (which would be much
  // slower).
  const { data: counts } = await supabase
    .from('quiz_questions')
    .select('quiz_id')
    .in('quiz_id', quizzes.map((q) => q.id));

  // Tally up how many question rows belong to each quiz_id.
  const countMap: Record<string, number> = {};
  (counts || []).forEach((r: { quiz_id: string }) => {
    countMap[r.quiz_id] = (countMap[r.quiz_id] || 0) + 1;
  });

  // Combine the quiz list with its question counts. `...q` copies every
  // existing field from the quiz, and we add `question_count` on top.
  return quizzes.map((q) => ({ ...q, question_count: countMap[q.id] || 0 }));
}

// Saves a brand new quiz — the quiz itself, PLUS every question, PLUS the
// correct-answer key for each question (stored in a SEPARATE table from
// the questions, so students can never accidentally see the answers — see
// the comment on quiz_answer_keys in supabase/setup.sql).
export async function createQuiz(companyId: string, draft: QuizDraft): Promise<{ error: string | null }> {
  // Step 1: create the quiz itself, and get back its new ID.
  const { data: quiz, error: quizErr } = await supabase
    .from('quizzes')
    .insert({ company_id: companyId, title: draft.title, description: draft.description })
    .select('id')
    .single(); // we expect exactly one row back
  if (quizErr || !quiz) return { error: quizErr?.message || 'Could not create quiz.' };

  // Step 2: save each question, one at a time, along with its answer key.
  for (let i = 0; i < draft.questions.length; i++) {
    const q = draft.questions[i];
    const { data: question, error: qErr } = await supabase
      .from('quiz_questions')
      .insert({ quiz_id: quiz.id, position: i, question: q.question, options: q.options })
      .select('id')
      .single();
    if (qErr || !question) {
      // Something failed partway through — rather than leave a
      // half-finished quiz (some questions saved, some not) sitting in
      // the database, delete the whole quiz. Because the database is set
      // up with "ON DELETE CASCADE" (see supabase/setup.sql), deleting
      // the quiz automatically deletes any questions/answers already
      // saved for it too — we don't have to clean those up by hand.
      await supabase.from('quizzes').delete().eq('id', quiz.id); // roll back partial quiz
      return { error: qErr?.message || 'Could not save a question.' };
    }
    const { error: keyErr } = await supabase
      .from('quiz_answer_keys')
      .insert({ question_id: question.id, correct_index: q.correctIndex });
    if (keyErr) {
      await supabase.from('quizzes').delete().eq('id', quiz.id);
      return { error: keyErr.message };
    }
  }
  return { error: null }; // no error = success
}

// Deletes a quiz entirely (and, thanks to the database's cascade rules,
// every question/answer/assignment tied to it too).
export async function deleteQuiz(quizId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('quizzes').delete().eq('id', quizId);
  return { error: error?.message || null };
}

// A minimal shape used for the "pick a student to send this quiz to" list
// — just enough to show a name and select them, nothing more.
export type StudentPick = { id: string; name: string };

// Pulls candidates from this company's own applicant list — a company can
// only send a quiz to someone who's actually applied to them, which is
// also what keeps quiz_assignments' RLS check (company owns the quiz) the
// only gate needed; there's no separate "can message this student" check
// to duplicate here.
export async function loadStudentPickerList(companyId: string): Promise<StudentPick[]> {
  const { data } = await supabase
    .from('company_applications')
    .select('student_id, full_name')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (!data) return [];

  // The same student might have applied more than once (different jobs),
  // which would create duplicate entries in a naive list — a `Set` here
  // remembers which student IDs we've already added, so each student only
  // shows up once in the final picker list.
  const seen = new Set<string>();
  const out: StudentPick[] = [];
  for (const row of data as { student_id: string; full_name: string }[]) {
    if (seen.has(row.student_id)) continue;
    seen.add(row.student_id);
    out.push({ id: row.student_id, name: row.full_name || 'Student' });
  }
  return out;
}

// Sends a quiz to one student as a DM: creates/reuses the conversation,
// creates the quiz_assignment row, and posts a message whose
// attachment_type='quiz' / attachment_url=<assignment id> is what
// MessagesView reads to render the inline QuizCard.
//
// IMPORTANT: a (quiz_id, student_id) pair is only ever allowed ONE
// assignment. Without this check, clicking "Send" again for someone who
// already has this quiz (on purpose, or just a double-click, or reopening
// the send dialog days later having forgotten) created a SECOND
// quiz_assignments row and a second DM message — a brand new, unstarted
// "Start Quiz" card sitting right there in the thread even though the
// student had already completed the first one. That's exactly what made
// it look like a completed quiz was being "asked again": it wasn't the
// same assignment reverting, it was a genuinely different one. Returning
// `alreadySent` here instead of creating a duplicate is what keeps a quiz
// truly one-time per student.
export async function sendQuizToStudent(
  companyId: string,
  companyName: string,
  studentId: string,
  quizId: string,
  quizTitle: string
): Promise<{ error: string | null; alreadySent?: boolean; existingStatus?: 'sent' | 'in_progress' | 'completed' }> {
  const { data: existing } = await supabase
    .from('quiz_assignments')
    .select('id, status')
    .eq('quiz_id', quizId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (existing) {
    return { error: null, alreadySent: true, existingStatus: existing.status as 'sent' | 'in_progress' | 'completed' };
  }

  // Conversations aren't stored as "from A to B" — they're stored as one
  // shared row between two people, with the two IDs always saved in
  // alphabetical order (`[a, b] = [...].sort()`). This way, whether the
  // company or the student "started" the conversation, we always look up
  // (or create) the exact same row instead of accidentally creating two
  // separate conversations between the same two people.
  const [a, b] = [companyId, studentId].sort();
  const { data: existingConv } = await supabase.from('conversations').select('id').eq('user_a', a).eq('user_b', b).maybeSingle();
  let conversationId = existingConv?.id as string | undefined;
  if (!conversationId) {
    // No conversation exists yet between these two — create one.
    const { data: created, error: convErr } = await supabase.from('conversations').insert({ user_a: a, user_b: b }).select('id').single();
    if (convErr || !created) return { error: convErr?.message || 'Could not open a conversation.' };
    conversationId = created.id;
  }

  // Create the "assignment" — the record that says "this specific quiz
  // has been sent to this specific student."
  const { data: assignment, error: assignErr } = await supabase
    .from('quiz_assignments')
    .insert({ quiz_id: quizId, company_id: companyId, student_id: studentId })
    .select('id')
    .single();
  if (assignErr || !assignment) return { error: assignErr?.message || 'Could not send quiz.' };

  // Post a chat message announcing the quiz. Setting `attachment_type` to
  // 'quiz' and `attachment_url` to the assignment's ID is the whole
  // mechanism that makes the quiz appear as an interactive card inside
  // the chat thread — see src/components/QuizCard.tsx and how
  // MessagesView.tsx checks `attachment_type` when drawing each message.
  const { error: msgErr } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: companyId,
    body: `Sent you a quiz: "${quizTitle}"`,
    attachment_url: assignment.id,
    attachment_name: quizTitle,
    attachment_type: 'quiz',
  });
  if (msgErr) return { error: msgErr.message };

  // Update the conversation's preview text (shown in the conversation
  // list) and timestamp (so it sorts to the top as "recently active").
  await supabase.from('conversations').update({
    last_message: `📋 Quiz: ${quizTitle}`,
    last_message_at: new Date().toISOString(),
  }).eq('id', conversationId);

  // Also create a bell-icon notification for the student, so they notice
  // even if they're not currently looking at their messages.
  await supabase.from('notifications').insert({
    user_id: studentId,
    type: 'message',
    title: `${companyName} sent you a quiz`,
    body: quizTitle,
    link_view: 'messages',
    link_id: conversationId,
  });

  return { error: null };
}

// A lookup of which students already have an assignment for a given quiz
// (any status), used by SendQuizModal so it can show "Already sent" /
// "Completed" up front — reading straight from the database instead of
// only remembering what was sent during the CURRENT modal session (which
// forgot everything the moment the modal was closed and reopened, another
// contributor to companies re-sending a quiz someone had already taken).
export async function loadQuizAssignmentStatuses(quizId: string): Promise<Record<string, 'sent' | 'in_progress' | 'completed'>> {
  const { data } = await supabase.from('quiz_assignments').select('id, student_id, status').eq('quiz_id', quizId);
  const map: Record<string, 'sent' | 'in_progress' | 'completed'> = {};
  if (!data || data.length === 0) return map;

  // Same fix as loadQuizResults below: don't rely solely on `status`,
  // since it can fall out of sync with whether a graded attempt actually
  // exists (see the comment there).
  const assignmentIds = data.map((r: { id: string }) => r.id);
  const { data: attempts } = await supabase.from('quiz_attempts').select('assignment_id').in('assignment_id', assignmentIds);
  const completedAssignmentIds = new Set((attempts || []).map((a: { assignment_id: string }) => a.assignment_id));

  (data as { id: string; student_id: string; status: 'sent' | 'in_progress' | 'completed' }[]).forEach((r) => {
    map[r.student_id] = completedAssignmentIds.has(r.id) ? 'completed' : r.status;
  });
  return map;
}

// One row of a quiz's results list: who it was sent to, whether they've
// taken it yet, and their score if they have.
export type QuizResultRow = {
  assignment_id: string;
  student_id: string;
  student_name: string;
  status: 'sent' | 'in_progress' | 'completed';
  score: number | null;
  total: number | null;
  submitted_at: string | null;
};

// Everyone a given quiz has been sent to, with their attempt (if any) —
// this is what QuizzesView's "Results" panel reads to show a company who
// has taken their quiz and how they scored, since nothing surfaced that
// anywhere before.
export async function loadQuizResults(quizId: string): Promise<QuizResultRow[]> {
  const { data: assignments } = await supabase
    .from('quiz_assignments')
    .select('id, student_id, status')
    .eq('quiz_id', quizId)
    .order('created_at', { ascending: false });
  if (!assignments || assignments.length === 0) return [];

  const studentIds = assignments.map((a: { student_id: string }) => a.student_id);
  const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', studentIds);
  const nameMap = new Map((profs || []).map((p: { id: string; full_name: string }) => [p.id, p.full_name || 'Student']));

  const assignmentIds = assignments.map((a: { id: string }) => a.id);
  const { data: attempts } = await supabase
    .from('quiz_attempts')
    .select('assignment_id, score, total, submitted_at')
    .in('assignment_id', assignmentIds);
  const attemptMap = new Map(
    (attempts || []).map((a: { assignment_id: string; score: number; total: number; submitted_at: string }) => [a.assignment_id, a])
  );

  return assignments.map((a: { id: string; student_id: string; status: 'sent' | 'in_progress' | 'completed' }) => {
    const att = attemptMap.get(a.id);
    // Trust the ATTEMPT's existence over the assignment's `status` column
    // when deciding whether this is "completed". They're supposed to be
    // set together (see api/quiz-submit.ts), but if that status update
    // ever silently fails (or a row is otherwise out of sync), a graded
    // attempt can exist while `status` still says 'sent'/'in_progress' —
    // which used to make a genuinely-submitted quiz show as "Not started"
    // with no score. Same reasoning QuizCard.tsx already uses on the
    // student side.
    const status: 'sent' | 'in_progress' | 'completed' = att ? 'completed' : a.status;
    return {
      assignment_id: a.id,
      student_id: a.student_id,
      student_name: nameMap.get(a.student_id) || 'Student',
      status,
      score: att?.score ?? null,
      total: att?.total ?? null,
      submitted_at: att?.submitted_at ?? null,
    };
  });
}
