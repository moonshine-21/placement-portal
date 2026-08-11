// Vercel Serverless Function — POST /api/admin-seed-bot-companies
//
// One-time (idempotent) setup: creates a handful of sample "bot" companies
// — real auth.users + profiles + company_profiles rows, exactly like any
// company account, just flagged is_bot=true and with no password anyone
// knows (nobody needs to log in as them; every action they take is written
// server-side by api/bot-*.ts using the service role). Each gets 2 starter
// jobs so there's something to browse/apply to immediately, without
// waiting on the first api/bot-rotate-jobs cron run.
//
// Restricted to admin/owner accounts. Safe to call more than once — any
// bot whose org_name already exists is skipped.

import { adminClient, resolveCaller } from './_lib/callerAuth.js';

export const config = { runtime: 'edge' };

type BotSeed = {
  org_name: string;
  industry: string;
  about_us: string;
  skills_required: string[];
  jobs: { job_name: string; role: string; description: string; skills_required: string[]; package_lpa: number; employees_needed: number }[];
};

const BOTS: BotSeed[] = [
  {
    org_name: 'Orbital Systems',
    industry: 'Cloud Infrastructure',
    about_us: 'We build managed Kubernetes and observability tooling for mid-size engineering teams. Small, remote-first team that hires a handful of new grads every cycle.',
    skills_required: ['Go', 'Kubernetes', 'Python', 'AWS'],
    jobs: [
      { job_name: 'Backend Engineer, Platform', role: 'Build and operate internal Kubernetes tooling', description: 'You will work on our control plane services in Go, own on-call rotations, and ship customer-facing infra features.', skills_required: ['Go', 'Kubernetes', 'Docker'], package_lpa: 12, employees_needed: 2 },
      { job_name: 'DevOps Intern', role: 'Support CI/CD and infra automation', description: 'A hands-on internship writing Terraform, improving deploy pipelines, and shadowing on-call.', skills_required: ['AWS', 'Python', 'Linux'], package_lpa: 6, employees_needed: 3 },
    ],
  },
  {
    org_name: 'Lumen Analytics',
    industry: 'Data & Analytics',
    about_us: 'We help retail brands turn point-of-sale data into forecasting models. Data-heavy, Python-first stack, small data science pod.',
    skills_required: ['Python', 'SQL', 'Machine Learning'],
    jobs: [
      { job_name: 'Data Analyst', role: 'Build dashboards and forecasting reports for retail clients', description: 'Own client-facing dashboards end to end, from SQL modeling to the final chart, working closely with account managers.', skills_required: ['SQL', 'Python', 'Excel'], package_lpa: 8, employees_needed: 2 },
      { job_name: 'Junior ML Engineer', role: 'Prototype demand-forecasting models', description: 'Work under a senior data scientist prototyping and evaluating forecasting models on real retail datasets.', skills_required: ['Python', 'Machine Learning', 'Pandas'], package_lpa: 10, employees_needed: 1 },
    ],
  },
  {
    org_name: 'Northbeam Studio',
    industry: 'Product Design & Frontend',
    about_us: 'A small product studio building web apps for startups. We care a lot about craft — clean component architecture, real design systems, fast iteration.',
    skills_required: ['React', 'TypeScript', 'CSS'],
    jobs: [
      { job_name: 'Frontend Engineer', role: 'Build client-facing React applications', description: 'Ship polished UI for multiple client projects in parallel, working directly with designers on component-level detail.', skills_required: ['React', 'TypeScript', 'CSS'], package_lpa: 9, employees_needed: 2 },
      { job_name: 'UI Engineering Intern', role: 'Assist on component library and small features', description: 'A design-engineering internship — build reusable components and fix small bugs across live client projects.', skills_required: ['React', 'HTML', 'CSS'], package_lpa: 5, employees_needed: 2 },
    ],
  },
  {
    org_name: 'Ferrovia Robotics',
    industry: 'Robotics & Embedded Systems',
    about_us: 'We build warehouse automation robots — motion control, embedded firmware, and the fleet software that coordinates them.',
    skills_required: ['C++', 'Embedded Systems', 'Python'],
    jobs: [
      { job_name: 'Embedded Systems Engineer', role: 'Write firmware for robot motion controllers', description: 'Work close to the hardware writing and testing real-time firmware, debugging on physical robots in our lab.', skills_required: ['C++', 'Embedded Systems', 'RTOS'], package_lpa: 11, employees_needed: 1 },
      { job_name: 'Robotics Software Engineer', role: 'Build fleet coordination and path-planning software', description: 'Work on the software layer that schedules and routes a fleet of warehouse robots in real time.', skills_required: ['C++', 'Python', 'Algorithms'], package_lpa: 13, employees_needed: 1 },
    ],
  },
  {
    org_name: 'Havenly Health',
    industry: 'HealthTech',
    about_us: 'We build scheduling and records software for small clinics. Regulated industry, careful engineering culture, backend-heavy team.',
    skills_required: ['Java', 'Spring Boot', 'SQL'],
    jobs: [
      { job_name: 'Backend Engineer', role: 'Build clinic scheduling and records APIs', description: 'Own backend services handling patient scheduling and records, with a strong focus on data correctness and privacy.', skills_required: ['Java', 'Spring Boot', 'PostgreSQL'], package_lpa: 10, employees_needed: 2 },
      { job_name: 'QA Engineer', role: 'Build automated test coverage for clinical workflows', description: 'Design and automate test suites for scheduling and records workflows where correctness really matters.', skills_required: ['SQL', 'Selenium', 'Java'], package_lpa: 7, employees_needed: 1 },
    ],
  },
];

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const admin = adminClient();
  if (!admin) return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 503 });

  const caller = await resolveCaller(req, admin);
  if (!caller) return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401 });

  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', caller.id).maybeSingle();
  if (!callerProfile || !['admin', 'owner'].includes(callerProfile.role)) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403 });
  }

  const results: Array<{ name: string; status: 'created' | 'skipped' | 'error'; detail?: string }> = [];

  for (const bot of BOTS) {
    const { data: existing } = await admin.from('company_profiles').select('id').eq('org_name', bot.org_name).maybeSingle();
    if (existing) {
      results.push({ name: bot.org_name, status: 'skipped', detail: 'already exists' });
      continue;
    }

    const slug = bot.org_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const email = `bot.${slug}@bots.smartplacementcell.internal`;
    const password = crypto.randomUUID() + crypto.randomUUID(); // nobody needs this — bots never log in

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (createErr || !created?.user) {
      results.push({ name: bot.org_name, status: 'error', detail: createErr?.message || 'auth user creation failed' });
      continue;
    }
    const userId = created.user.id;

    await admin.from('profiles').upsert({ id: userId, email, full_name: bot.org_name, role: 'company' }, { onConflict: 'id' });
    const { error: cpErr } = await admin.from('company_profiles').upsert({
      id: userId,
      org_name: bot.org_name,
      industry: bot.industry,
      about_us: bot.about_us,
      skills_required: bot.skills_required,
      is_bot: true,
    }, { onConflict: 'id' });
    if (cpErr) {
      results.push({ name: bot.org_name, status: 'error', detail: cpErr.message });
      continue;
    }

    for (const job of bot.jobs) {
      await admin.from('jobs').insert({ company_id: userId, ...job, status: 'open' });
    }

    results.push({ name: bot.org_name, status: 'created' });
  }

  return new Response(JSON.stringify({ ok: true, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
