// Vercel Serverless Function — POST /api/company-activate
//
// Company account activation. No payment collection at all — signing up
// as a company is free. Still writes a `payments` row (provider='free',
// amount 0, status='paid') so there's one consistent audit trail if
// paid activation ever comes back later.

import { adminClient, resolveCaller, grantCompanyRole } from './_lib/callerAuth.js';
import { rateLimit, sweepIfDue, clientIp } from './_lib/rateLimit.js';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  sweepIfDue();
  const rl = rateLimit(`company-activate:${clientIp(req)}`, 10, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests, try again shortly.' }), {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
  }

  const admin = adminClient();
  if (!admin) {
    console.error('[company-activate-free] server not configured');
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 503 });
  }

  const caller = await resolveCaller(req, admin);
  if (!caller) {
    return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401 });
  }

  const { data: profile } = await admin.from('profiles').select('role').eq('id', caller.id).maybeSingle();
  if (profile?.role === 'company') {
    return new Response(JSON.stringify({ error: 'This account is already a company account.' }), { status: 400 });
  }

  await admin.from('payments').insert({
    user_id: caller.id,
    purpose: 'company_profile_activation',
    provider: 'free',
    external_id: `free_${crypto.randomUUID()}`,
    amount_paise: 0,
    currency: 'INR',
    status: 'paid',
    paid_at: new Date().toISOString(),
  });

  const { error: grantErr } = await grantCompanyRole(admin, caller.id);
  if (grantErr) {
    console.error('[company-activate-free] failed to grant company role:', grantErr);
    return new Response(JSON.stringify({ error: 'Activation failed — please try again.' }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
