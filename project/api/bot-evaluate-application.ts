// Vercel Serverless Function — POST /api/bot-evaluate-application
//
// Called by the client right after a student submits a company_applications
// row to a bot company (see src/views/CompaniesBrowseView.tsx's ApplyModal).
// Evaluates the candidate's profile against the job/company requirements via
// Gemini, sets the application to 'shortlisted' or 'rejected', DMs the
// candidate the reasoning, and — on a shortlist — auto-generates and sends a
// short quiz for the role. Every write here uses the service role, since a
// student's own session can update their own application's status via RLS
// (matches.status is student-owned) but should never be trusted to grade
// itself, and can never post a message as company_id.

import { adminClient, resolveCaller } from './_lib/callerAuth.js';
import { getBotPersona, sendBotMessage } from './_lib/bots.js';
import { generateJSON } from './_lib/gemini.js';
import { rateLimit, sweepIfDue, clientIp } from './_lib/rateLimit.js';

export const config = { runtime: 'edge' };

type Decision = { decision: 'shortlist' | 'reject'; reason: string };
type QuizDraft = { title: string; questions: { question: string; options: string[]; correctIndex: number }[] };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  sweepIfDue();
  const rl = rateLimit(`bot-evaluate-application:${clientIp(req)}`, 10, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests, try again shortly.' }), {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
  }

  const admin = adminClient();
  if (!admin) return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 503 });

  const caller = await resolveCaller(req, admin);
  if (!caller) return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401 });

  let body: { applicationId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }
  const applicationId = body.applicationId;
  if (!applicationId) return new Response(JSON.stringify({ error: 'Missing applicationId' }), { status: 400 });

  const { data: application } = await admin
    .from('company_applications')
    .select('id, company_id, student_id, job_id, full_name, comment, status')
    .eq('id', applicationId)
    .maybeSingle();
  if (!application) return new Response(JSON.stringify({ error: 'Application not found' }), { status: 404 });
  if (application.student_id !== caller.id) {
    return new Response(JSON.stringify({ error: 'Not your application' }), { status: 403 });
  }
  if (application.status !== 'pending' && application.status !== 'submitted') {
    // Already evaluated (or a human took over) — don't re-grade.
    return new Response(JSON.stringify({ ok: true, evaluated: false, note: 'already evaluated' }), { status: 200 });
  }

  const persona = await getBotPersona(admin, application.company_id);
  if (!persona) {
    return new Response(JSON.stringify({ ok: true, evaluated: false, note: 'not a bot company' }), { status: 200 });
  }

  let job: { job_name: string; role: string; description: string; skills_required: string[]; package_lpa: number } | null = null;
  if (application.job_id) {
    const { data: jobRow } = await admin
      .from('jobs')
      .select('job_name, role, description, skills_required, package_lpa')
      .eq('id', application.job_id)
      .maybeSingle();
    job = jobRow || null;
  }

  const { data: studentProfile } = await admin
    .from('profiles')
    .select('full_name, branch, cgpa, skills, resume_text')
    .eq('id', caller.id)
    .maybeSingle();

  const requiredSkills = job?.skills_required?.length ? job.skills_required : persona.skills_required;

  const evalPrompt = `You are a hiring recruiter at ${persona.org_name} (industry: ${persona.industry || 'general'}) reviewing one job application on a campus placement platform.

Role applied for: ${job?.job_name || 'General application'} — ${job?.role || 'n/a'}
Role requirements: ${requiredSkills?.join(', ') || 'none specified'}${job?.package_lpa ? ` · package: ${job.package_lpa} LPA` : ''}

Candidate: ${studentProfile?.full_name || application.full_name}
Branch: ${studentProfile?.branch || 'n/a'} · CGPA: ${studentProfile?.cgpa ?? 'n/a'}
Listed skills: ${(studentProfile?.skills || []).join(', ') || 'none listed'}
Resume text: ${(studentProfile?.resume_text || '').slice(0, 3000) || 'no resume text available'}
Candidate's note: ${application.comment || 'none'}

Decide whether to shortlist or reject this candidate for the role, based on skill/branch/CGPA fit. Be reasonably generous — this is an early screening step, not a final hiring decision — but a candidate with little to no overlap with the role's requirements should be rejected.

Return JSON exactly like:
{"decision": "shortlist" | "reject", "reason": "1-2 sentence message to send the candidate directly, in a warm professional recruiter tone, explaining the decision"}`;

  const decision = await generateJSON<Decision>(evalPrompt, { temperature: 0.4, maxOutputTokens: 400 });
  if (!decision || (decision.decision !== 'shortlist' && decision.decision !== 'reject')) {
    // Gemini exhausted/misconfigured/malformed — leave the application
    // 'pending' rather than guess, so a human (or a retry) can still act on it.
    return new Response(JSON.stringify({ ok: true, evaluated: false, note: 'generation failed' }), { status: 200 });
  }

  const newStatus = decision.decision === 'shortlist' ? 'shortlisted' : 'rejected';
  await admin.from('company_applications').update({ status: newStatus }).eq('id', applicationId);
  await admin.from('notifications').insert({
    user_id: caller.id,
    type: 'status',
    title: `Your application is now "${newStatus}"`,
    body: persona.org_name,
    link_view: 'applications',
  });

  const { error: dmErr } = await sendBotMessage(admin, application.company_id, caller.id, decision.reason, {
    notifyTitle: `${persona.org_name} reviewed your application`,
  });
  if (dmErr) console.error('[bot-evaluate-application] DM failed:', dmErr);

  if (newStatus !== 'shortlisted') {
    return new Response(JSON.stringify({ ok: true, evaluated: true, status: newStatus }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // Shortlisted — auto-generate and send a short quiz for this role.
  const quizPrompt = `Create a short screening quiz for a "${job?.job_name || persona.industry + ' role'}" position at a ${persona.industry || 'tech'} company. Required skills: ${requiredSkills?.join(', ') || 'general aptitude'}.

Return JSON exactly like:
{"title": "short quiz title", "questions": [{"question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0}]}

Write exactly 4 multiple-choice questions, each with exactly 4 options, testing practical knowledge of the required skills (not trivia). correctIndex is the 0-based index of the right option.`;

  const quizDraft = await generateJSON<QuizDraft>(quizPrompt, { temperature: 0.6, maxOutputTokens: 1200 });
  if (!quizDraft?.questions?.length) {
    console.error('[bot-evaluate-application] quiz generation failed or empty, skipping quiz send');
    return new Response(JSON.stringify({ ok: true, evaluated: true, status: newStatus, quizSent: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const { data: quizRow, error: quizErr } = await admin
    .from('quizzes')
    .insert({ company_id: application.company_id, title: quizDraft.title, description: `Screening quiz for ${job?.job_name || persona.org_name}` })
    .select('id')
    .single();

  if (quizErr || !quizRow) {
    console.error('[bot-evaluate-application] could not create quiz:', quizErr);
    return new Response(JSON.stringify({ ok: true, evaluated: true, status: newStatus, quizSent: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  for (let i = 0; i < quizDraft.questions.length; i++) {
    const q = quizDraft.questions[i];
    if (!q.question || !Array.isArray(q.options) || q.options.length < 2) continue;
    const { data: qRow, error: qErr } = await admin
      .from('quiz_questions')
      .insert({ quiz_id: quizRow.id, position: i, question: q.question, options: q.options })
      .select('id')
      .single();
    if (qErr || !qRow) continue;
    const safeIndex = Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.options.length ? q.correctIndex : 0;
    await admin.from('quiz_answer_keys').insert({ question_id: qRow.id, correct_index: safeIndex });
  }

  const { data: assignment, error: assignErr } = await admin
    .from('quiz_assignments')
    .insert({ quiz_id: quizRow.id, company_id: application.company_id, student_id: caller.id })
    .select('id')
    .single();

  if (assignErr || !assignment) {
    console.error('[bot-evaluate-application] could not create quiz assignment:', assignErr);
    return new Response(JSON.stringify({ ok: true, evaluated: true, status: newStatus, quizSent: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  await sendBotMessage(admin, application.company_id, caller.id, `Sent you a quiz: "${quizDraft.title}"`, {
    attachmentUrl: assignment.id,
    attachmentName: quizDraft.title,
    attachmentType: 'quiz',
    lastMessagePreview: `📋 Quiz: ${quizDraft.title}`,
    notifyTitle: `${persona.org_name} sent you a quiz`,
  });

  return new Response(JSON.stringify({ ok: true, evaluated: true, status: newStatus, quizSent: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
