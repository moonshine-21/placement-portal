// api/company-activate.ts
//
// This file runs on Anthropic— sorry, on VERCEL's servers, not in the
// user's browser. It's what actually turns a normal student/user account
// into a "Company" account when someone clicks the activation button.
//
// WHY THIS HAS TO RUN ON THE SERVER (not just in the website's JavaScript):
// If this logic lived in the browser, anyone could open their browser's
// developer tools and just tell their own account "you're a company now,"
// with nobody checking. By putting this one small decision on the server,
// using a special "admin" key that only the server has, we make sure the
// only way to become a company is by going through this exact code.
//
// There is NO payment step here at all — becoming a company is free.

import { adminClient, resolveCaller, grantCompanyRole } from './_lib/callerAuth.js';
import { rateLimit, sweepIfDue, clientIp } from './_lib/rateLimit.js';

// Vercel needs this line to know it should run this file on its fast
// "Edge" servers instead of a regular server. You don't need to touch this.
export const config = { runtime: 'edge' };

// This function runs every time the website calls POST /api/company-activate.
// "req" (short for "request") is the incoming ask from the browser.
// It must return a "Response" — the answer we send back.
export default async function handler(req: Request): Promise<Response> {
  // Step 1: Only allow this to be called as a POST request (the "I want to
  // DO something" type of web request, as opposed to GET which just reads
  // data). If someone tries any other method, reject it immediately.
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  // Step 2: Rate limiting — stop one person from spamming this endpoint
  // hundreds of times per minute. sweepIfDue() cleans up old rate-limit
  // records so memory doesn't fill up forever; rateLimit() checks "has
  // this specific visitor (identified by their IP address) already used
  // up their 10-per-minute allowance?"
  sweepIfDue();
  const rl = rateLimit(`company-activate:${clientIp(req)}`, 10, 60_000);
  if (!rl.allowed) {
    // 429 is the standard web status code for "you're doing that too much,
    // slow down." Retry-After tells the browser how many seconds to wait.
    return new Response(JSON.stringify({ error: 'Too many requests, try again shortly.' }), {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
  }

  // Step 3: Get our "admin" connection to the database. This is a special,
  // powerful connection (using the SUPABASE_SERVICE_ROLE_KEY environment
  // variable) that can read/write anything, ignoring the normal privacy
  // rules — which is exactly what we need to grant someone a new role.
  const admin = adminClient();
  if (!admin) {
    // This only happens if the server itself is misconfigured (missing
    // an environment variable) — not something the visitor did wrong.
    console.error('[company-activate] server not configured');
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 503 });
  }

  // Step 4: Figure out WHO is actually asking. The browser sends along a
  // login token (like a stamped ticket proving "I already signed in"), and
  // resolveCaller() asks Supabase's own servers "is this ticket real, and
  // whose is it?" We never trust an ID the browser just tells us directly,
  // since that could be faked.
  const caller = await resolveCaller(req, admin);
  if (!caller) {
    return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401 });
  }

  // Step 5: Look up this person's current role, so we don't let someone
  // who is already a company "activate" a second time for no reason.
  const { data: profile } = await admin.from('profiles').select('role').eq('id', caller.id).maybeSingle();
  if (profile?.role === 'company') {
    return new Response(JSON.stringify({ error: 'This account is already a company account.' }), { status: 400 });
  }

  // Step 6: The actual activation. grantCompanyRole is a shared helper
  // (in _lib/callerAuth.ts) that changes this person's role to 'company'
  // in the database and creates their (empty, ready-to-fill-in) company
  // profile row.
  const { error: grantErr } = await grantCompanyRole(admin, caller.id);
  if (grantErr) {
    console.error('[company-activate] failed to grant company role:', grantErr);
    return new Response(JSON.stringify({ error: 'Activation failed — please try again.' }), { status: 500 });
  }

  // Step 7: Success! Tell the browser everything worked so it can show the
  // "welcome, Company!" screen.
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
