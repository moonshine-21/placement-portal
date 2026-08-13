// Vercel Serverless Function — GET/POST /api/bot-rotate-jobs
//
// Meant to run on a schedule (see the `crons` entry in vercel.json), not to
// be called by the client. For every bot company: if it already has
// MAX_OPEN_JOBS_PER_BOT open jobs, deletes the single oldest one, then
// always posts one freshly Gemini-generated job — so listings keep moving
// (new jobs appear, old ones disappear) without a human ever touching them.
//
// Protected by CRON_SECRET: set this in Vercel's env vars, and Vercel's own
// Cron Jobs feature automatically sends it as
// `Authorization: Bearer <CRON_SECRET>` on scheduled invocations, so nobody
// else can trigger job churn (and burn your Gemini quota) by hitting this
// URL directly.

import { adminClient } from './_lib/callerAuth.js';
import { generateJSON } from './_lib/gemini.js';

export const config = { runtime: 'edge' };

const MAX_OPEN_JOBS_PER_BOT = 3;

type JobDraft = {
  job_name: string;
  role: string;
  description: string;
  skills_required: string[];
  package_lpa: number;
  employees_needed: number;
};

export default async function handler(req: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
  }

  const admin = adminClient();
  if (!admin) return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 503 });

  const { data: bots } = await admin
    .from('company_profiles')
    .select('id, org_name, industry, about_us, skills_required')
    .eq('is_bot', true);

  if (!bots || bots.length === 0) {
    return new Response(JSON.stringify({ ok: true, rotated: 0, note: 'no bot companies found' }), { status: 200 });
  }

  const results: Array<{ company: string; deleted: string | null; created: string | null; error?: string }> = [];

  for (const bot of bots) {
    const entry: { company: string; deleted: string | null; created: string | null; error?: string } = {
      company: bot.org_name, deleted: null, created: null,
    };

    const { data: openJobs } = await admin
      .from('jobs')
      .select('id, job_name, created_at')
      .eq('company_id', bot.id)
      .eq('status', 'open')
      .order('created_at', { ascending: true });

    if (openJobs && openJobs.length >= MAX_OPEN_JOBS_PER_BOT) {
      const oldest = openJobs[0];
      const { error: delErr } = await admin.from('jobs').delete().eq('id', oldest.id);
      if (delErr) {
        entry.error = `delete failed: ${delErr.message}`;
      } else {
        entry.deleted = oldest.job_name;
      }
    }

    const prompt = `Invent one realistic, currently-open job opening for ${bot.org_name}, a company in the ${bot.industry || 'technology'} industry. Company description: ${bot.about_us || 'n/a'}. Typical skills this company hires for: ${(bot.skills_required || []).join(', ') || 'general technical skills'}.

Return JSON exactly like:
{"job_name": "short job title", "role": "1-line role summary", "description": "2-3 sentence job description", "skills_required": ["skill1", "skill2", "skill3"], "package_lpa": 6, "employees_needed": 2}

package_lpa is annual package in lakhs per annum (a plausible number for this role/industry, e.g. 4-40). Vary the specific role from generic postings — be specific to this company's stated focus.`;

    const draft = await generateJSON<JobDraft>(prompt, { temperature: 0.9, maxOutputTokens: 500 });
    if (!draft?.job_name) {
      entry.error = (entry.error ? entry.error + '; ' : '') + 'job generation failed';
      results.push(entry);
      continue;
    }

    const { error: insErr } = await admin.from('jobs').insert({
      company_id: bot.id,
      job_name: draft.job_name,
      role: draft.role || '',
      description: draft.description || '',
      skills_required: Array.isArray(draft.skills_required) ? draft.skills_required : [],
      package_lpa: Number(draft.package_lpa) || 0,
      employees_needed: Number(draft.employees_needed) || 1,
      status: 'open',
    });

    if (insErr) {
      entry.error = (entry.error ? entry.error + '; ' : '') + `insert failed: ${insErr.message}`;
    } else {
      entry.created = draft.job_name;
    }
    results.push(entry);
  }

  return new Response(JSON.stringify({ ok: true, rotated: results.length, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
