// ============================================================================
// api/_lib/callerAuth.ts
//
// WHAT THIS FILE IS: shared helpers used by (almost) every server function
// in api/ — the backend equivalent of src/lib/auth.tsx. Its job is
// answering two different questions safely:
//
//   1. "Who is REALLY making this request?" (resolveCaller) — never by
//      trusting a plain user ID typed into the request body (anyone could
//      fake that), but by checking the person's actual login token against
//      Supabase's own servers.
//
//   2. "How do I get FULL, unrestricted access to the database, bypassing
//      the normal per-user security rules?" (adminClient) — needed for
//      things like granting someone the "company" role, which a normal
//      logged-in user is deliberately NOT allowed to do to themselves.
//
// Never trust a user id sent in the request body — that's just a string the
// client typed. Instead we take the Supabase access token from the
// Authorization header (the same token the client already holds from its
// signed-in session) and ask Supabase's own auth server to resolve it to a
// real user. This is what makes it safe for api/quiz-submit.ts and
// api/company-activate.ts to act "as" a specific user without letting
// anyone impersonate someone else by editing a request body.
// ============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Creates a database connection using the SERVICE ROLE KEY — a special,
// much more powerful credential than the normal "anon key" the browser
// uses. A service-role connection completely ignores the database's Row
// Level Security rules (the "who can see/edit what" rules — see
// supabase/setup.sql), so it can do literally anything to any row.
//
// This is exactly why it must ONLY ever be used in server-side code (like
// this file, running on Vercel's servers) and never sent to the browser —
// if this key ever leaked into client-side code, anyone could use it to
// bypass every security rule in the entire app.
//
// Returns `null` if the required environment variables aren't set up,
// rather than crashing — callers check for null and respond with a clear
// "server misconfigured" error instead.
export function adminClient(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  // `persistSession: false` — this connection is created fresh for each
  // individual request and thrown away right after, so there's no reason
  // for it to try to remember a login session between calls.
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// Figures out WHO is actually making this request, by checking their login
// token — never by trusting anything the client claims about itself in
// the request body.
//
// Returns `{ id, email }` if the token is valid and belongs to a real
// logged-in user, or `null` if it's missing/invalid (meaning: reject the
// request, they're not properly logged in).
export async function resolveCaller(req: Request, admin: SupabaseClient): Promise<{ id: string; email: string | null } | null> {
  // Browsers send their login proof in a standard HTTP header shaped like:
  // "Authorization: Bearer <the actual token text>" — this line pulls out
  // just the token part, stripping the "Bearer " prefix.
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null; // no token at all — definitely not logged in

  // Ask Supabase's own auth servers "is this a real, currently-valid
  // token, and if so, who does it belong to?" This is the step that
  // actually makes it safe — a token can't be faked or guessed, since
  // it's cryptographically tied to a real login session.
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

// Promotes a user's account to the "company" role, AND makes sure they
// have a (possibly empty) company_profiles row to go with it. This is the
// ONLY way a company account gets created in this app — see
// api/company-activate.ts, the sole caller of this function.
export async function grantCompanyRole(admin: SupabaseClient, userId: string): Promise<{ error: string | null }> {
  // Service-role writes bypass the self-role-change trigger (see
  // supabase/migrations/20260731110000_security_hardening.sql) — that
  // trigger only fires when auth.uid() = the row being edited, which is
  // never true for a service-role connection, so this is the intended
  // escape hatch, not a workaround.
  const { error: roleErr } = await admin.from('profiles').update({ role: 'company' }).eq('id', userId);
  if (roleErr) return { error: roleErr.message };
  // Also make sure a company_profiles row exists for them (a blank one,
  // if they don't already have one — `ignoreDuplicates: true` means "if
  // one already exists, just leave it alone, don't error and don't
  // overwrite it").
  await admin.from('company_profiles').upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });
  return { error: null };
}
