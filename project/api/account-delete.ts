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
// underlying auth.users row is deleted. There is nothing else this endpoint
// needs to clean up by hand: one admin.auth.admin.deleteUser() call removes
// the account and everything attached to it, immediately, which is exactly
// why a deleted company disappears from students' "companies hiring" list
// right away.
import { adminClient, resolveCaller } from './_lib/callerAuth.js';
import { rateLimit, sweepIfDue, clientIp } from './_lib/rateLimit.js';

export const config = { runtime: 'edge' };

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

  // This is the actual, permanent deletion. `shouldSoftDelete: false`
  // (the default) means Supabase removes the auth.users row for real,
  // which — per every ON DELETE CASCADE foreign key in the schema —
  // cascades to remove every other row belonging to this account too.
  const { error } = await admin.auth.admin.deleteUser(caller.id);
  if (error) {
    console.error('[account-delete] failed to delete user:', error);
    return new Response(JSON.stringify({ error: 'Account deletion failed — please try again.' }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
