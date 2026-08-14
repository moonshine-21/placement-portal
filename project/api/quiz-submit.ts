// Vercel Serverless Function — POST /api/quiz-submit
//
// The only place a quiz attempt is ever graded. `quiz_answer_keys` has no
// RLS policy that lets a student read it (see the migration), so the
// student's browser genuinely cannot know the correct answers — grading
// has to happen here, server-side with the service role, using the
// student's own submitted answers plus the real answer key.

import { adminClient, resolveCaller } from './_lib/callerAuth.js';
import { rateLimit, sweepIfDue, clientIp } from './_lib/rateLimit.js';

export const config = { runtime: 'edge' };

type ReqBody = {
  assignment_id?: string;
  answers?: Record<string, number>; // question_id -> selected option index
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  sweepIfDue();
  const rl = rateLimit(`quiz-submit:${clientIp(req)}`, 20, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests, try again shortly.' }), {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
  }

  const admin = adminClient();
  if (!admin) {
    console.error('[quiz-submit] server not configured');
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 503 });
  }

  const caller = await resolveCaller(req, admin);
  if (!caller) {
    return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401 });
  }

  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  const assignmentId = body.assignment_id;
  const answers = body.answers || {};
  if (!assignmentId) {
    return new Response(JSON.stringify({ error: 'Missing assignment_id' }), { status: 400 });
  }

  const { data: assignment } = await admin
    .from('quiz_assignments')
    .select('id, quiz_id, student_id, status')
    .eq('id', assignmentId)
    .maybeSingle();

  if (!assignment || assignment.student_id !== caller.id) {
    return new Response(JSON.stringify({ error: 'Quiz assignment not found for this account.' }), { status: 404 });
  }
  if (assignment.status === 'completed') {
    return new Response(JSON.stringify({ error: 'This quiz has already been submitted.' }), { status: 400 });
  }

  const { data: questions, error: qErr } = await admin
    .from('quiz_questions')
    .select('id, question, options, quiz_answer_keys(correct_index)')
    .eq('quiz_id', assignment.quiz_id)
    .order('position', { ascending: true });

  if (qErr || !questions || questions.length === 0) {
    console.error('[quiz-submit] failed to load questions/answer key:', qErr);
    return new Response(JSON.stringify({ error: 'Could not load quiz questions.' }), { status: 500 });
  }

  let score = 0;
  const breakdown = questions.map((q: any) => {
    const correctIndex = q.quiz_answer_keys?.correct_index ?? -1;
    const selected = answers[q.id];
    const correct = selected === correctIndex;
    if (correct) score += 1;
    return { question_id: q.id, question: q.question, options: q.options, selected_index: selected ?? null, correct_index: correctIndex, correct };
  });
  const total = questions.length;

  const { error: attemptErr } = await admin.from('quiz_attempts').insert({
    assignment_id: assignmentId,
    student_id: caller.id,
    answers,
    score,
    total,
  });
  if (attemptErr) {
    console.error('[quiz-submit] failed to record attempt:', attemptErr);
    return new Response(JSON.stringify({ error: 'Could not save your attempt. Please try again.' }), { status: 500 });
  }

  await admin.from('quiz_assignments').update({ status: 'completed' }).eq('id', assignmentId);

  return new Response(JSON.stringify({ score, total, breakdown }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
