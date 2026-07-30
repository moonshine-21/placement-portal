import { supabase } from './supabase';
import type { Profile, Company, Match } from './supabase';

export async function loadCompanies(): Promise<Company[]> {
  const { data, error } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('loadCompanies failed:', error);
    return [];
  }
  return (data as Company[]) || [];
}

export async function loadMatches(studentId: string): Promise<Match[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*, companies(*)')
    .eq('student_id', studentId)
    .order('match_score', { ascending: false });
  if (error) {
    console.error('loadMatches failed:', error);
    return [];
  }
  return (data as Match[]) || [];
}

export function computeMatch(profile: Profile, company: Company): {
  score: number;
  matched: string[];
  missing: string[];
  eligible: boolean;
  reasoning: string;
} {
  const studentSkills = profile.skills || [];
  const requiredSkills = company.required_skills || [];
  const matched = requiredSkills.filter((s) =>
    studentSkills.some((ss) => ss.toLowerCase().trim() === s.toLowerCase().trim())
  );
  const missing = requiredSkills.filter((s) =>
    !studentSkills.some((ss) => ss.toLowerCase().trim() === s.toLowerCase().trim())
  );

  let score = 0;
  if (requiredSkills.length > 0) {
    score = Math.round((matched.length / requiredSkills.length) * 60);
  } else {
    score = 30;
  }

  if (profile.cgpa >= company.min_cgpa) score += 20;
  else score += Math.max(0, Math.round((profile.cgpa / company.min_cgpa) * 20));

  const branches = company.required_branches || [];
  if (branches.length === 0 || branches.includes(profile.branch)) score += 10;
  else score += 3;

  if (profile.profile_completion >= 80) score += 10;
  else score += Math.round((profile.profile_completion / 80) * 10);

  score = Math.min(100, score);

  const eligible = profile.cgpa >= company.min_cgpa &&
    (branches.length === 0 || branches.includes(profile.branch));

  const reasoning = missing.length === 0
    ? `You meet all required skills and eligibility criteria for ${company.name}.`
    : `Strong match for ${company.name}. Closing the skill gap in ${missing.slice(0, 3).join(', ')} would make you a top candidate.`;

  return { score, matched, missing, eligible, reasoning };
}

export async function generateAndSaveMatches(profile: Profile, companies: Company[]): Promise<Match[]> {
  if (!profile || companies.length === 0) return [];

  const matches: Omit<Match, 'id' | 'created_at'>[] = companies.map((company) => {
    const { score, matched, missing, eligible, reasoning } = computeMatch(profile, company);
    return {
      student_id: profile.id,
      company_id: company.id,
      match_score: score,
      matched_skills: matched,
      missing_skills: missing,
      eligible,
      reasoning,
      status: 'matched',
    };
  });

  const { data, error } = await supabase
    .from('matches')
    .upsert(matches, { onConflict: 'student_id,company_id' })
    .select('*, companies(*)')
    .order('match_score', { ascending: false });

  if (error) {
    console.error('generateAndSaveMatches failed:', error);
    return [];
  }
  return (data as Match[]) || [];
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
  const completion = calculateProfileCompletion(updates);
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
