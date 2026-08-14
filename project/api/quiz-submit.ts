// ============================================================================
// Vercel Serverless Function — POST /api/quiz-submit
//
// WHAT THIS FILE IS: the ONLY place a quiz attempt is ever graded.
// `quiz_answer_keys` has no RLS policy that lets a student read it (see
// supabase/setup.sql), so the student's browser genuinely cannot know the
// correct answers — grading has to happen here, server-side with the
// service role, using the student's own submitted answers plus the real
// answer key. This is what makes it impossible for a student to open
// their browser's dev tools and peek at the correct answers before
// submitting — the answers simply never get sent to their browser at all,
// until after they've already answered and this function grades it.
// ============================================================================

import { adminClient, resolveCaller } from './_lib/callerAuth.js';
import { rateLimit, sweepIfDue, clientIp } from './_lib/rateLimit.js';

export const config = { runtime: 'edge' };

// What the browser sends us: which quiz assignment this is for, plus a
// lookup table of { question_id: which option index they picked }.
type ReqBody = {
  assignment_id?: string;
  answers?: Record<string, number>; // question_id -> selected option index
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  // Stop someone from spamming quiz submissions (e.g. scripting repeated
  // guesses) — see api/_lib/rateLimit.ts for how this works.
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

  // Figure out WHO is actually submitting, from their real login token —
  // never trust a student_id if it were sent in the request body (it
  // isn't, precisely for this reason).
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

  // Look up the assignment — this both confirms it's a real assignment
  // AND (crucially) confirms it belongs to the person actually submitting
  // it, via the `assignment.student_id !== caller.id` check just below.
  const { data: assignment } = await admin
    .from('quiz_assignments')
    .select('id, quiz_id, student_id, status')
    .eq('id', assignmentId)
    .maybeSingle();

  if (!assignment || assignment.student_id !== caller.id) {
    // Deliberately the same error whether the assignment doesn't exist OR
    // belongs to someone else — this avoids leaking information about
    // which assignment IDs are real to someone probing this endpoint.
    return new Response(JSON.stringify({ error: 'Quiz assignment not found for this account.' }), { status: 404 });
  }
  if (assignment.status === 'completed') {
    // Prevent submitting the same quiz twice (e.g. to try to game a
    // better score on a second attempt).
    return new Response(JSON.stringify({ error: 'This quiz has already been submitted.' }), { status: 400 });
  }

  // Fetch every question for this quiz, AND its correct answer, in one
  // query. `quiz_answer_keys(correct_index)` is Supabase's way of joining
  // in the related answer-key row for each question — this only works
  // here because we're using the service-role connection, which bypasses
  // the RLS rule that normally hides this table from everyone else.
  const { data: questions, error: qErr } = await admin
    .from('quiz_questions')
    .select('id, question, options, quiz_answer_keys(correct_index)')
    .eq('quiz_id', assignment.quiz_id)
    .order('position', { ascending: true });

  if (qErr || !questions || questions.length === 0) {
    console.error('[quiz-submit] failed to load questions/answer key:', qErr);
    return new Response(JSON.stringify({ error: 'Could not load quiz questions.' }), { status: 500 });
  }

  // Grade every question: compare what the student picked against the
  // real correct answer, and build a detailed breakdown to send back (so
  // the UI can show the student exactly which questions they got right or
  // wrong, and what the correct answer was).
  let score = 0;
  const breakdown = questions.map((q: any) => {
    const correctIndex = q.quiz_answer_keys?.correct_index ?? -1; // -1 as a safe fallback if something's oddly missing
    const selected = answers[q.id]; // what the student picked for this question (may be undefined if they skipped it)
    const correct = selected === correctIndex;
    if (correct) score += 1;
    return { question_id: q.id, question: q.question, options: q.options, selected_index: selected ?? null, correct_index: correctIndex, correct };
  });
  const total = questions.length;

  // Permanently record this attempt (their raw answers + the final score)
  // — this is what QuizzesView.tsx and ApplicantsView.tsx later read to
  // show "this student scored 3/4."
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

  // Mark the assignment as completed, so re-submitting is blocked (see
  // the check near the top of this function) and the UI knows to show
  // "completed" instead of "take quiz." The attempt row above is what
  // actually matters (the UI now falls back to "an attempt exists" as the
  // source of truth — see loadQuizResults in src/lib/quiz.ts), but we
  // still log if this ever fails so a status/attempt mismatch doesn't go
  // unnoticed silently.
  const { error: statusErr } = await admin.from('quiz_assignments').update({ status: 'completed' }).eq('id', assignmentId);
  if (statusErr) {
    console.error('[quiz-submit] failed to mark assignment completed (attempt was still saved):', statusErr);
  }

  // Send the graded result back to the browser, including the correct
  // answers — this is safe NOW, since the student has already submitted
  // their attempt and it's locked in; there's nothing left to cheat.
  return new Response(JSON.stringify({ score, total, breakdown }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
