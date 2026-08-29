// api/account-delete.ts
//
// This file runs on Vercel's servers, not in the user's browser. It's what
// actually, permanently deletes a signed-in user's account when they
// confirm "Delete Account" in Settings.
//
// WHY THIS HAS TO RUN ON THE SERVER: deleting an auth.users row can only be
// done with Supabase's admin/service-role key — the browser's normal
// connection is deliberately never allowed to do this (imagine if any
// visitor could delete ANY account just by knowing its ID). So the browser
// asks this server endpoint to do it on the account's own behalf, and this
// endpoint checks the caller's login token before doing anything.
//
// WHAT ACTUALLY GETS DELETED: every table in supabase/setup.sql that
// references a user (profiles, company_profiles, jobs, company_applications,
// applications, matches, conversations, messages, friends, calls, quizzes,
// quiz_assignments, notifications, forum_posts, etc.) declares its foreign
// key as `REFERENCES auth.users(id) ON DELETE CASCADE`. That means the
// database itself automatically removes every row belonging to this user —
// including, for a company account, its `jobs` rows — the instant the
// underlying auth.users row is deleted. That's also exactly why a deleted
// company disappears from students' "companies hiring" list right away.
//
// ONE THING THAT ISN'T COVERED BY THOSE CASCADES: any file the person
// uploaded (an avatar, a banner image, a resume, a message attachment).
// Those don't live in one of our own tables — they live in Supabase's own
// internal storage system, which keeps its own record of who uploaded each
// file. That internal record points back at this same account, and unlike
// our own tables we don't control its cleanup rule — so if it isn't
// removed FIRST, Supabase refuses to delete the account at all once it
// still owns files, and returns an error instead. That is why deletion
// could appear to work for a brand new account with no uploads, yet fail
// for a real one with an avatar or resume already on it. Every upload in
// this app is saved under `<bucket>/<the person's own user id>/<filename>`
// (see uploadPublicFile / uploadPrivateFile in src/lib/data.ts), so we can
// find and remove all of a person's files before deleting them, in every
// bucket a person can personally upload to.
import { adminClient, resolveCaller } from './_lib/callerAuth.js';
import { rateLimit, sweepIfDue, clientIp } from './_lib/rateLimit.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

// Buckets a person can personally upload into (see src/lib/data.ts callers):
// avatars/banners (public profile images) and resumes/attachments (private
// files). Deliberately excludes 'branding', which holds the SITE's shared
// logo/branding assets set by an admin/owner — not something tied to any
// one person's account, and not something deleting your own account
// should ever touch.
const USER_BUCKETS = ['avatars', 'banners', 'resumes', 'attachments'];

// Deletes every file this person has ever uploaded, across every bucket
// they can personally upload to. Best-effort: if listing or removing from
// one bucket fails, we log it and keep going with the others, rather than
// letting one hiccup block the whole account deletion — worst case, one
// bucket's files may still be attached, which is exactly the situation
// this whole function exists to avoid, but at least the rest gets cleaned
// up and the real error is visible in the logs.
async function deleteUserFiles(admin: SupabaseClient, userId: string): Promise<void> {
  for (const bucket of USER_BUCKETS) {
    try {
      const { data: files, error: listErr } = await admin.storage.from(bucket).list(userId);
      if (listErr) {
        console.error(`[account-delete] could not list ${bucket}/${userId}:`, listErr);
        continue;
      }
      if (!files || files.length === 0) continue;
      const paths = files.map((f) => `${userId}/${f.name}`);
      const { error: removeErr } = await admin.storage.from(bucket).remove(paths);
      if (removeErr) {
        console.error(`[account-delete] could not remove files from ${bucket}/${userId}:`, removeErr);
      }
    } catch (err) {
      console.error(`[account-delete] unexpected error cleaning up ${bucket}/${userId}:`, err);
    }
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  // Deleting an account is rare and irreversible — a tight limit here is
  // just an extra speed bump, not something a legitimate user should ever
  // notice.
  sweepIfDue();
  const rl = rateLimit(`account-delete:${clientIp(req)}`, 5, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests, try again shortly.' }), {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
  }

  const admin = adminClient();
  if (!admin) {
    console.error('[account-delete] server not configured');
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 503 });
  }

  // Who is actually asking — resolved from their own login token, never
  // from an ID the browser could have typed into the request body. This is
  // also what guarantees someone can only ever delete THEIR OWN account,
  // never anyone else's.
  const caller = await resolveCaller(req, admin);
  if (!caller) {
    return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401 });
  }

  // Clean up their uploaded files FIRST — see deleteUserFiles above for
  // why this has to happen before deleteUser, not after.
  await deleteUserFiles(admin, caller.id);

  // This is the actual, permanent deletion. `shouldSoftDelete: false`
  // (the default) means Supabase removes the auth.users row for real,
  // which — per every ON DELETE CASCADE foreign key in the schema —
  // cascades to remove every other row belonging to this account too.
  const { error } = await admin.auth.admin.deleteUser(caller.id);
  if (error) {
    // Logging (and returning) the real message here, rather than a generic
    // string, matters: it's the only way to tell "storage files were still
    // attached" apart from every other possible reason this could fail —
    // this text is a plain database/auth message, nothing private about
    // the account itself.
    console.error('[account-delete] failed to delete user:', error);
    return new Response(JSON.stringify({ error: `Account deletion failed: ${error.message}` }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
