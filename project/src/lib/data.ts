import { supabase } from './supabase';
import type { Profile, Job, CompanyProfile, JobMatch } from './supabase';

// ----------------------------------------------------------------------
// Matches & Recommendations
//
// IMPORTANT CONTEXT: this app used to have a separate, simpler
// `companies` + `matches` table pair (seeded with 10 placeholder
// companies like "Nimbus Labs", "Quantum Systems", etc — see
// 20260730154708_create_complete_schema.sql). Once real company
// accounts existed, those placeholders were deleted (see
// 20260731050000_remove_demo_companies.sql) and every real company
// since then has lived in `company_profiles` + `jobs` instead — but
// nothing ever migrated the Matches/Recommendations feature (this file,
// MatchesView.tsx, and DashboardView.tsx) over to the new tables. The
// result: `companies` has been permanently empty ever since, so every
// student has been seeing "No matches yet" regardless of their profile,
// and the Dashboard's match-related stats have all silently been zero.
//
// The functions below replace the old company/matches-table versions:
// they compute a match between a student and each currently OPEN job
// posting (real company_profiles + jobs data), entirely in memory —
// no separate `matches` table to keep in sync, so it's always current
// the moment a company posts or edits a job.
// ----------------------------------------------------------------------

export async function loadOpenJobs(): Promise<(Job & { company_profiles: CompanyProfile | null })[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*, company_profiles(*)')
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('loadOpenJobs failed:', error);
    return [];
  }
  return (data as (Job & { company_profiles: CompanyProfile | null })[]) || [];
}

export function computeJobMatch(profile: Profile, job: Job & { company_profiles: CompanyProfile | null }): JobMatch | null {
  const company = job.company_profiles;
  // A job whose company_profiles row was deleted, or was never filled
  // in (no org_name yet), isn't something to show a student.
  if (!company || !company.org_name) return null;

  const studentSkills = profile.skills || [];
  const requiredSkills = job.skills_required?.length ? job.skills_required : (company.skills_required || []);
  const matched = requiredSkills.filter((s) =>
    studentSkills.some((ss) => ss.toLowerCase().trim() === s.toLowerCase().trim())
  );
  const missing = requiredSkills.filter((s) => !matched.includes(s));

  // Skill overlap is worth up to 70 points; a well-filled-out profile
  // (resume, bio, skills all present) accounts for the other 30 — the
  // same "profile completeness matters" idea the old company-based
  // version had, just without a min_cgpa/required_branches concept that
  // `jobs` doesn't have columns for.
  let score = requiredSkills.length > 0 ? Math.round((matched.length / requiredSkills.length) * 70) : 35;
  score += Math.round(((profile.profile_completion || 0) / 100) * 30);
  score = Math.min(100, score);

  // "Eligible" here means "covers a meaningful chunk of what's required"
  // rather than a hard CGPA/branch cutoff (jobs doesn't store either) —
  // still a useful signal for whether it's worth applying.
  const eligible = requiredSkills.length === 0 || matched.length / requiredSkills.length >= 0.4;

  const reasoning = requiredSkills.length === 0
    ? `${company.org_name} hasn't listed specific required skills for this role — worth a look regardless.`
    : missing.length === 0
      ? `You meet every required skill for ${company.org_name}'s ${job.job_name} role.`
      : `Good fit for ${company.org_name}. Picking up ${missing.slice(0, 3).join(', ')} would make you an even stronger candidate.`;

  return {
    job_id: job.id,
    company_id: company.id,
    company_name: company.org_name,
    company_avatar_url: company.avatar_url,
    job_name: job.job_name,
    role: job.role,
    package_lpa: job.package_lpa,
    match_score: score,
    matched_skills: matched,
    missing_skills: missing,
    eligible,
    reasoning,
  };
}

export function generateJobMatches(profile: Profile, jobs: (Job & { company_profiles: CompanyProfile | null })[]): JobMatch[] {
  return jobs
    .map((j) => computeJobMatch(profile, j))
    .filter((m): m is JobMatch => m !== null)
    .sort((a, b) => b.match_score - a.match_score);
}

export function calculateProfileCompletion(profile: Partial<Profile>): number {
  let completion = 0;
  if (profile.full_name) completion += 15;
  if (profile.bio && profile.bio.length > 10) completion += 15;
  if (profile.branch) completion += 15;
  if (profile.cgpa && profile.cgpa > 0) completion += 15;
  if (profile.skills && profile.skills.length > 0) completion += 25;
  if (profile.avatar_url) completion += 15;
  return Math.min(100, completion);
}

export async function saveProfile(userId: string, email: string, updates: Partial<Profile>) {
  // Merge with the existing row first — otherwise a partial update (e.g. just
  // avatar_url from a photo upload) would compute completion from only the
  // fields being sent and wipe out the real percentage.
  const { data: existing } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  const merged = { ...(existing || {}), ...updates };
  const completion = calculateProfileCompletion(merged);
  const payload = { id: userId, email, profile_completion: completion, ...updates };
  const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
  if (error) console.error('saveProfile failed:', error);
  return { error };
}

export async function uploadPublicFile(bucket: string, file: File, userId: string): Promise<string | null> {
  const path = `${userId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

export async function uploadPrivateFile(bucket: string, file: File, userId: string): Promise<string | null> {
  const path = `${userId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) return null;
  return path;
}

export async function openPrivateFile(bucket: string, path: string): Promise<void> {
  if (!path) return;
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return;
  const url = URL.createObjectURL(data);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
