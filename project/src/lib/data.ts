// ============================================================================
// src/lib/data.ts
//
// WHAT THIS FILE IS: a grab-bag of shared helper functions used across
// many different pages — the "AI matching" score calculation (which
// company fits which student, and how well), saving a student's profile
// (with automatic "profile completion %" calculation), uploading/opening
// files (resumes, avatars) in Supabase's file storage, and a small
// "3h ago" style time-formatting helper. These are grouped here, instead
// of copy-pasted into every page that needs them, so there's exactly one
// place to fix a bug or change behavior.
// ============================================================================

import { supabase } from './supabase';
import type { Profile, Company, Match } from './supabase';

// Fetches every entry in the older `companies` table (see the Company type
// in supabase.ts for what this represents) — used by the AI Matching
// feature to compare a student against.
export async function loadCompanies(): Promise<Company[]> {
  const { data, error } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('loadCompanies failed:', error);
    return []; // fail gracefully with an empty list, rather than crashing the page
  }
  return (data as Company[]) || [];
}

// Fetches a student's saved match results, best-scoring first.
// `select('*, companies(*)')` is Supabase's way of saying "also fetch the
// full related Company row for each match, joined together in one query"
// — without this, we'd get back just the raw match_score numbers with no
// company name/details attached to display.
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

// THE CORE MATCHING ALGORITHM: given one student's profile and one
// Company's requirements, calculates a 0-100 "how good a fit is this"
// score, plus which skills matched/were missing, whether they meet the
// hard eligibility bar, and a short plain-English explanation.
//
// This is a plain calculation — no AI/machine learning involved, just
// straightforward arithmetic rules, which makes it fast, free, and fully
// predictable/explainable (useful to know for a presentation: you can
// walk through exactly why any given score came out the way it did).
export function computeMatch(profile: Profile, company: Company): {
  score: number;
  matched: string[];
  missing: string[];
  eligible: boolean;
  reasoning: string;
} {
  const studentSkills = profile.skills || [];
  const requiredSkills = company.required_skills || [];

  // Which of the company's required skills does the student have listed?
  // Comparing `.toLowerCase().trim()` on both sides means "Python",
  // "python", and " Python " are all treated as the exact same skill —
  // otherwise tiny typing differences would wrongly count as a mismatch.
  const matched = requiredSkills.filter((s) =>
    studentSkills.some((ss) => ss.toLowerCase().trim() === s.toLowerCase().trim())
  );
  // Which required skills are NOT in the student's list?
  const missing = requiredSkills.filter((s) =>
    !studentSkills.some((ss) => ss.toLowerCase().trim() === s.toLowerCase().trim())
  );

  // --- Scoring breakdown (adds up to a maximum of 100) ---

  // Up to 60 points: what fraction of required skills does the student have?
  let score = 0;
  if (requiredSkills.length > 0) {
    score = Math.round((matched.length / requiredSkills.length) * 60);
  } else {
    // If a company doesn't specify required skills at all, give a flat
    // middling score for this portion rather than either 0 or full marks.
    score = 30;
  }

  // Up to 20 points: how does their CGPA compare to the minimum required?
  if (profile.cgpa >= company.min_cgpa) score += 20; // meets or beats the bar — full points
  else score += Math.max(0, Math.round((profile.cgpa / company.min_cgpa) * 20)); // below it — partial credit, proportional to how close they are

  // Up to 10 points: is their branch (field of study) one this company
  // accepts?
  const branches = company.required_branches || [];
  if (branches.length === 0 || branches.includes(profile.branch)) score += 10; // no restriction, or they match it
  else score += 3; // wrong branch — small consolation points, not zero, since branch alone shouldn't fully disqualify a good match

  // Up to 10 points: how complete/filled-in is their profile? (An
  // incomplete profile is a weaker application even with great skills.)
  if (profile.profile_completion >= 80) score += 10;
  else score += Math.round((profile.profile_completion / 80) * 10);

  // Safety cap — the math above shouldn't be able to exceed 100, but this
  // guarantees it never does even if a future edit introduces a bug.
  score = Math.min(100, score);

  // "Eligible" is a separate yes/no from the score — a student could have
  // a high score but still not meet the HARD requirements (CGPA cutoff,
  // right branch), in which case they shouldn't be treated as truly
  // eligible even if their skills look great.
  const eligible = profile.cgpa >= company.min_cgpa &&
    (branches.length === 0 || branches.includes(profile.branch));

  // A short, plain-English one-liner summarizing the result, shown
  // directly to the student.
  const reasoning = missing.length === 0
    ? `You meet all required skills and eligibility criteria for ${company.name}.`
    : `Strong match for ${company.name}. Closing the skill gap in ${missing.slice(0, 3).join(', ')} would make you a top candidate.`;

  return { score, matched, missing, eligible, reasoning };
}

// Runs computeMatch() against EVERY company for one student, and saves
// (or updates) all the results in the database at once, then returns the
// freshly-saved list (best score first) ready to display.
export async function generateAndSaveMatches(profile: Profile, companies: Company[]): Promise<Match[]> {
  if (!profile || companies.length === 0) return [];

  // Build the full list of match rows to save, one per company.
  // `Omit<Match, 'id' | 'created_at'>` means "the same shape as Match, but
  // without the id/created_at fields" — because those two get generated
  // automatically by the database when the row is created, we shouldn't
  // (and can't) supply them ourselves.
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

  // `.upsert(...)` means "insert these rows, but if a row with the same
  // student_id+company_id combo already exists, update it instead of
  // creating a duplicate." This is exactly what we want — re-running the
  // match calculation (e.g. after the student updates their skills)
  // should refresh the existing scores, not pile up old stale copies.
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

// Calculates a simple 0-100 "how filled-in is this profile" percentage,
// based on which fields have meaningful values. Used both to show a
// progress bar to the student, and (see computeMatch above) as one small
// factor in the match score itself.
//
// `Partial<Profile>` means "an object with SOME of Profile's fields, not
// necessarily all of them" — useful here since this can be called with
// either a full profile or just the handful of fields being updated.
export function calculateProfileCompletion(profile: Partial<Profile>): number {
  let completion = 0;
  if (profile.full_name) completion += 15;
  if (profile.bio && profile.bio.length > 10) completion += 15; // require a REAL bio, not just one or two characters
  if (profile.branch) completion += 15;
  if (profile.cgpa && profile.cgpa > 0) completion += 15;
  if (profile.skills && profile.skills.length > 0) completion += 25; // skills matter most for matching, so they're weighted heaviest
  if (profile.avatar_url) completion += 15;
  return Math.min(100, completion); // these add up to exactly 100 already, but the cap is a safety net
}

// Saves changes to a student's profile — used by src/views/ProfileView.tsx
// whenever they edit any part of their profile (name, bio, skills, avatar,
// etc, one field or several at once).
export async function saveProfile(userId: string, email: string, updates: Partial<Profile>) {
  // Merge with the existing row first — otherwise a partial update (e.g. just
  // avatar_url from a photo upload) would compute completion from only the
  // fields being sent and wipe out the real percentage.
  const { data: existing } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  // `{ ...(existing || {}), ...updates }` builds one combined object: start
  // with everything already saved, then overwrite with whatever fields
  // this specific call is changing. This way, `calculateProfileCompletion`
  // below always sees the FULL picture, not just the fields being touched
  // right now.
  const merged = { ...(existing || {}), ...updates };
  const completion = calculateProfileCompletion(merged);
  const payload = { id: userId, email, profile_completion: completion, ...updates };
  // `.upsert(...)` here means "update the existing profile row, or create
  // it if for some reason it doesn't exist yet."
  const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
  if (error) console.error('saveProfile failed:', error);
  return { error };
}

// Uploads a file to a PUBLIC storage "bucket" (a folder-like container in
// Supabase's file storage) and returns a URL anyone can view — used for
// things like profile avatars and banners, where showing the image to
// other visitors is the whole point.
export async function uploadPublicFile(bucket: string, file: File, userId: string): Promise<string | null> {
  // Build a file path that starts with the user's own ID (so files are
  // naturally organized per-user) and includes the current timestamp (so
  // uploading a file with the same name twice never overwrites the first
  // one by accident). The `.replace(...)` strips out any character that
  // isn't a safe filename character, replacing it with an underscore.
  const path = `${userId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) return null;
  // Ask Supabase for the public, shareable URL of the file we just uploaded.
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

// Same idea, but for a PRIVATE bucket — used for resumes, where we do NOT
// want just anyone with the link to view it. Notice this returns the raw
// `path` instead of a public URL, since a private file has no public URL
// at all; viewing it later requires openPrivateFile() below, which proves
// the viewer is allowed to see it.
export async function uploadPrivateFile(bucket: string, file: File, userId: string): Promise<string | null> {
  const path = `${userId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) return null;
  return path;
}

// Opens a private file (like a resume) in a new browser tab. Because the
// file is private, we can't just link to it directly — instead we
// download the raw file data (which only works if the viewer's login
// passes the storage bucket's access rules) and turn it into a short-lived
// temporary local URL the browser can open.
export async function openPrivateFile(bucket: string, path: string): Promise<void> {
  if (!path) return;
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return;
  // `URL.createObjectURL` creates a special browser-only URL (starting
  // with "blob:") that points at the downloaded file data sitting in
  // memory — it doesn't exist anywhere on the internet, only in this tab.
  const url = URL.createObjectURL(data);
  window.open(url, '_blank');
  // Clean up that temporary URL after 30 seconds — plenty of time for the
  // new tab to have actually loaded the file, without leaving it sitting
  // around in memory forever.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Turns an exact timestamp (like "2026-08-04T10:15:00Z") into a
// friendly relative description like "Just now", "5m ago", "3h ago", or
// "2d ago" — used throughout the app wherever a "posted X ago" style
// label is shown.
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime(); // difference, in milliseconds
  const m = Math.floor(diff / 60000); // convert to whole minutes
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); // convert to whole hours
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); // convert to whole days
  return `${d}d ago`;
}
