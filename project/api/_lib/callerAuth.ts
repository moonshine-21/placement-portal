// Shared helper for edge functions that need to know WHO is calling them.
//
// Never trust a user id sent in the request body — that's just a string the
// client typed. Instead we take the Supabase access token from the
// Authorization header (the same token the client already holds from its
// signed-in session) and ask Supabase's own auth server to resolve it to a
// real user. This is what makes it safe for api/quiz-submit.ts and
// api/company-activate.ts to act "as" a specific user without letting
// anyone impersonate someone else by editing a request body.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function adminClient(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function resolveCaller(req: Request, admin: SupabaseClient): Promise<{ id: string; email: string | null } | null> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function grantCompanyRole(admin: SupabaseClient, userId: string): Promise<{ error: string | null }> {
  // Service-role writes bypass the self-role-change trigger (see
  // supabase/migrations/20260731110000_security_hardening.sql) — that
  // trigger only fires when auth.uid() = the row being edited, which is
  // never true for a service-role connection, so this is the intended
  // escape hatch, not a workaround.
  const { error: roleErr } = await admin.from('profiles').update({ role: 'company' }).eq('id', userId);
  if (roleErr) return { error: roleErr.message };
  await admin.from('company_profiles').upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });
  return { error: null };
}
