import { supabase } from './supabase';

export type QuizDraft = {
  title: string;
  description: string;
  questions: { question: string; options: string[]; correctIndex: number }[];
};

export type QuizListItem = {
  id: string;
  title: string;
  description: string;
  created_at: string;
  question_count: number;
};

export async function loadCompanyQuizzes(companyId: string): Promise<QuizListItem[]> {
  const { data: quizzes } = await supabase
    .from('quizzes')
    .select('id, title, description, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (!quizzes) return [];

  const { data: counts } = await supabase
    .from('quiz_questions')
    .select('quiz_id')
    .in('quiz_id', quizzes.map((q) => q.id));

  const countMap: Record<string, number> = {};
  (counts || []).forEach((r: { quiz_id: string }) => {
    countMap[r.quiz_id] = (countMap[r.quiz_id] || 0) + 1;
  });

  return quizzes.map((q) => ({ ...q, question_count: countMap[q.id] || 0 }));
}

export async function createQuiz(companyId: string, draft: QuizDraft): Promise<{ error: string | null }> {
  const { data: quiz, error: quizErr } = await supabase
    .from('quizzes')
    .insert({ company_id: companyId, title: draft.title, description: draft.description })
    .select('id')
    .single();
  if (quizErr || !quiz) return { error: quizErr?.message || 'Could not create quiz.' };

  for (let i = 0; i < draft.questions.length; i++) {
    const q = draft.questions[i];
    const { data: question, error: qErr } = await supabase
      .from('quiz_questions')
      .insert({ quiz_id: quiz.id, position: i, question: q.question, options: q.options })
      .select('id')
      .single();
    if (qErr || !question) {
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
  return { error: null };
}

export async function deleteQuiz(quizId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('quizzes').delete().eq('id', quizId);
  return { error: error?.message || null };
}

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
export async function sendQuizToStudent(
  companyId: string,
  companyName: string,
  studentId: string,
  quizId: string,
  quizTitle: string
): Promise<{ error: string | null }> {
  const [a, b] = [companyId, studentId].sort();
  const { data: existingConv } = await supabase.from('conversations').select('id').eq('user_a', a).eq('user_b', b).maybeSingle();
  let conversationId = existingConv?.id as string | undefined;
  if (!conversationId) {
    const { data: created, error: convErr } = await supabase.from('conversations').insert({ user_a: a, user_b: b }).select('id').single();
    if (convErr || !created) return { error: convErr?.message || 'Could not open a conversation.' };
    conversationId = created.id;
  }

  const { data: assignment, error: assignErr } = await supabase
    .from('quiz_assignments')
    .insert({ quiz_id: quizId, company_id: companyId, student_id: studentId })
    .select('id')
    .single();
  if (assignErr || !assignment) return { error: assignErr?.message || 'Could not send quiz.' };

  const { error: msgErr } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: companyId,
    body: `Sent you a quiz: "${quizTitle}"`,
    attachment_url: assignment.id,
    attachment_name: quizTitle,
    attachment_type: 'quiz',
  });
  if (msgErr) return { error: msgErr.message };

  await supabase.from('conversations').update({
    last_message: `📋 Quiz: ${quizTitle}`,
    last_message_at: new Date().toISOString(),
  }).eq('id', conversationId);

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
