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

// CORS: this endpoint is now called from the separate admin-app deployment
// (a different origin than the main site), not just from same-origin code.
// Auth is already enforced below via the bearer token, so reflecting the
// request's origin here doesn't weaken anything — it just lets a browser
// on a different domain read the response.
function corsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
}

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
  {
    org_name: 'Wavefront Fintech',
    industry: 'Financial Technology',
    about_us: 'We build payment reconciliation and fraud-detection tooling for mid-size banks. High-throughput systems, strict correctness bar.',
    skills_required: ['Java', 'Kafka', 'SQL'],
    jobs: [
      { job_name: 'Backend Engineer, Payments', role: 'Build reconciliation pipelines', description: 'Work on event-driven pipelines that reconcile millions of daily transactions across partner banks.', skills_required: ['Java', 'Kafka', 'PostgreSQL'], package_lpa: 14, employees_needed: 2 },
      { job_name: 'Risk Analytics Intern', role: 'Support fraud-detection model tuning', description: 'Analyze transaction data and help tune thresholds for the fraud-detection pipeline under a senior analyst.', skills_required: ['Python', 'SQL', 'Statistics'], package_lpa: 6, employees_needed: 2 },
    ],
  },
  {
    org_name: 'Marketloop Commerce',
    industry: 'E-commerce',
    about_us: 'We run the storefront and checkout platform for a network of D2C brands. Fast-moving, high-traffic, customer-facing product work.',
    skills_required: ['React', 'Node.js', 'TypeScript'],
    jobs: [
      { job_name: 'Full Stack Engineer', role: 'Build storefront and checkout features', description: 'Ship features across the storefront and checkout flow, working with product and design on a weekly release cycle.', skills_required: ['React', 'Node.js', 'TypeScript'], package_lpa: 10, employees_needed: 3 },
      { job_name: 'Frontend Intern', role: 'Assist on storefront UI components', description: 'Build and polish storefront UI components, working through real bug reports from live merchants.', skills_required: ['React', 'CSS', 'JavaScript'], package_lpa: 5, employees_needed: 2 },
    ],
  },
  {
    org_name: 'Skyline Games',
    industry: 'Gaming',
    about_us: 'A mobile games studio shipping casual multiplayer titles. Small teams, fast prototyping, players in the loop from day one.',
    skills_required: ['C#', 'Unity', 'Game Design'],
    jobs: [
      { job_name: 'Gameplay Engineer', role: 'Build core gameplay systems in Unity', description: 'Prototype and ship gameplay mechanics for live mobile titles, iterating directly off player analytics.', skills_required: ['C#', 'Unity', 'Game Design'], package_lpa: 8, employees_needed: 2 },
      { job_name: 'Backend Engineer, Live Ops', role: 'Build matchmaking and live-ops services', description: 'Own backend services for matchmaking, leaderboards, and live events across multiple titles.', skills_required: ['Node.js', 'Redis', 'SQL'], package_lpa: 9, employees_needed: 1 },
    ],
  },
  {
    org_name: 'Ironclad Security',
    industry: 'Cybersecurity',
    about_us: 'We build vulnerability scanning and incident-response tooling for enterprise security teams. Deep, technical, adversarial work.',
    skills_required: ['Python', 'Networking', 'Linux'],
    jobs: [
      { job_name: 'Security Engineer', role: 'Build and tune vulnerability scanners', description: 'Extend our scanning engine and triage findings, working closely with the incident-response team on real cases.', skills_required: ['Python', 'Networking', 'Linux'], package_lpa: 12, employees_needed: 1 },
      { job_name: 'SOC Analyst Intern', role: 'Support alert triage and reporting', description: 'Shadow the security operations team, triage alerts, and help build out detection rule coverage.', skills_required: ['Linux', 'Networking', 'SQL'], package_lpa: 6, employees_needed: 2 },
    ],
  },
  {
    org_name: 'Pathwise EdTech',
    industry: 'Education Technology',
    about_us: 'We build adaptive learning software used by high schools to personalize practice sets. Small backend team, content-heavy product.',
    skills_required: ['Python', 'Django', 'PostgreSQL'],
    jobs: [
      { job_name: 'Backend Engineer', role: 'Build adaptive learning APIs', description: 'Work on the recommendation engine that personalizes practice sets for individual students at scale.', skills_required: ['Python', 'Django', 'PostgreSQL'], package_lpa: 8, employees_needed: 2 },
      { job_name: 'Product Analyst Intern', role: 'Analyze learning outcome data', description: 'Dig into student progress data to help the product team decide what to build next.', skills_required: ['SQL', 'Python', 'Excel'], package_lpa: 5, employees_needed: 1 },
    ],
  },
  {
    org_name: 'Genomix Bio',
    industry: 'Biotechnology',
    about_us: 'We build software that helps genomics labs manage sequencing pipelines and sample tracking. Regulated, data-heavy, precision matters.',
    skills_required: ['Python', 'SQL', 'Bioinformatics'],
    jobs: [
      { job_name: 'Bioinformatics Engineer', role: 'Build sequencing pipeline tooling', description: 'Work on pipelines that process sequencing data end to end, from raw reads to lab-ready reports.', skills_required: ['Python', 'Bioinformatics', 'Linux'], package_lpa: 11, employees_needed: 1 },
      { job_name: 'Data Engineer Intern', role: 'Support sample-tracking data systems', description: 'Help build out ETL jobs that keep lab sample data synced and queryable across systems.', skills_required: ['Python', 'SQL', 'ETL'], package_lpa: 6, employees_needed: 1 },
    ],
  },
  {
    org_name: 'Signalcore Telecom',
    industry: 'Telecommunications',
    about_us: 'We build network monitoring and capacity-planning tools for regional telecom carriers. Infra-heavy, real-time data at scale.',
    skills_required: ['Go', 'Kubernetes', 'Networking'],
    jobs: [
      { job_name: 'Site Reliability Engineer', role: 'Operate network monitoring infrastructure', description: 'Keep our real-time monitoring stack healthy at scale and build tooling to catch network issues early.', skills_required: ['Go', 'Kubernetes', 'Networking'], package_lpa: 13, employees_needed: 1 },
      { job_name: 'Backend Engineer', role: 'Build capacity-planning services', description: 'Build backend services that model and forecast network capacity for carrier partners.', skills_required: ['Go', 'PostgreSQL', 'Python'], package_lpa: 11, employees_needed: 2 },
    ],
  },
  {
    org_name: 'Reelframe Media',
    industry: 'Media & Streaming',
    about_us: 'We build the backend behind a mid-size video streaming service — encoding pipelines, CDN routing, and recommendation feeds.',
    skills_required: ['Python', 'AWS', 'Distributed Systems'],
    jobs: [
      { job_name: 'Backend Engineer, Streaming', role: 'Build video encoding and delivery pipelines', description: 'Work on the pipeline that transcodes and routes video content to viewers with minimal latency.', skills_required: ['Python', 'AWS', 'Distributed Systems'], package_lpa: 12, employees_needed: 1 },
      { job_name: 'Data Engineer Intern', role: 'Support recommendation feed data pipelines', description: 'Help build and maintain the data pipelines feeding the recommendation system.', skills_required: ['Python', 'SQL', 'Spark'], package_lpa: 6, employees_needed: 2 },
    ],
  },
  {
    org_name: 'Coldchain Logistics',
    industry: 'Logistics & Supply Chain',
    about_us: 'We build route optimization and cold-chain tracking software for perishable goods shippers. Real-world constraints, real deadlines.',
    skills_required: ['Python', 'Algorithms', 'SQL'],
    jobs: [
      { job_name: 'Software Engineer, Routing', role: 'Build route optimization algorithms', description: 'Improve the routing engine that plans delivery routes under time and temperature constraints.', skills_required: ['Python', 'Algorithms', 'SQL'], package_lpa: 10, employees_needed: 2 },
      { job_name: 'Backend Intern', role: 'Support shipment tracking APIs', description: 'Work on APIs that track shipment status and temperature data across the delivery network.', skills_required: ['Python', 'REST APIs', 'SQL'], package_lpa: 5, employees_needed: 2 },
    ],
  },
  {
    org_name: 'Fieldsight AR',
    industry: 'AR/VR',
    about_us: 'We build AR tooling for industrial field technicians — overlaying repair instructions on real equipment through a headset or phone.',
    skills_required: ['C++', 'Unity', 'Computer Vision'],
    jobs: [
      { job_name: 'AR Engineer', role: 'Build AR overlay and tracking features', description: 'Work on the tracking and rendering pipeline that keeps AR overlays locked onto real equipment.', skills_required: ['C++', 'Unity', 'Computer Vision'], package_lpa: 12, employees_needed: 1 },
      { job_name: 'Mobile Engineer Intern', role: 'Support companion mobile app', description: 'Help build the companion mobile app that syncs repair instructions to the field team.', skills_required: ['Kotlin', 'Android', 'REST APIs'], package_lpa: 6, employees_needed: 1 },
    ],
  },
  {
    org_name: 'Verdant Grid',
    industry: 'Renewable Energy',
    about_us: 'We build monitoring and forecasting software for solar and wind farm operators. Sensor-heavy data, real infrastructure impact.',
    skills_required: ['Python', 'Machine Learning', 'SQL'],
    jobs: [
      { job_name: 'Data Engineer', role: 'Build sensor data pipelines', description: 'Build and maintain pipelines ingesting sensor data from solar and wind installations in real time.', skills_required: ['Python', 'SQL', 'ETL'], package_lpa: 9, employees_needed: 1 },
      { job_name: 'ML Engineer Intern', role: 'Prototype energy output forecasting models', description: 'Work under a senior engineer prototyping models that forecast farm output from weather and sensor data.', skills_required: ['Python', 'Machine Learning', 'Pandas'], package_lpa: 6, employees_needed: 1 },
    ],
  },
  {
    org_name: 'Assurely Insurance Tech',
    industry: 'Insurance Technology',
    about_us: 'We build claims processing and underwriting software for regional insurers. Backend-heavy, rules-driven, careful engineering.',
    skills_required: ['Java', 'Spring Boot', 'SQL'],
    jobs: [
      { job_name: 'Backend Engineer, Claims', role: 'Build claims processing APIs', description: 'Own backend services that process and route insurance claims through underwriting rules.', skills_required: ['Java', 'Spring Boot', 'PostgreSQL'], package_lpa: 10, employees_needed: 2 },
      { job_name: 'QA Engineer Intern', role: 'Build test coverage for claims workflows', description: 'Design and automate tests for claims and underwriting workflows where edge cases matter a lot.', skills_required: ['SQL', 'Java', 'Selenium'], package_lpa: 5, employees_needed: 1 },
    ],
  },
];

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders(req) });
  }

  const admin = adminClient();
  if (!admin) return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 503, headers: corsHeaders(req) });

  const caller = await resolveCaller(req, admin);
  if (!caller) return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: corsHeaders(req) });

  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', caller.id).maybeSingle();
  if (!callerProfile || !['admin', 'owner'].includes(callerProfile.role)) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: corsHeaders(req) });
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

  return new Response(JSON.stringify({ ok: true, results }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } });
}
