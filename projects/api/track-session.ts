// ============================================================================
// Vercel Serverless Function — POST /api/track-session
//
// WHAT THIS FILE IS: the server-side other half of
// src/lib/sessionGuard.tsx. Called once per app load from the browser,
// signed in or not. This is the ONLY writer of `device_sessions`, and it
// uses SUPABASE_SERVICE_ROLE_KEY (server-only, never shipped to the
// browser) so it bypasses RLS — a visitor's browser can send us its own
// fingerprint, but it can never read or forge someone else's session row,
// and it can't tamper with the ban lists it's being checked against.
//
// IP address is read from the request headers, never trusted from the
// request body, so a client can't lie about its own IP to dodge a ban.
//
// Set SUPABASE_SERVICE_ROLE_KEY in your Vercel project's Environment
// Variables (Project Settings → Environment Variables). Find the value in
// your Supabase project under Settings → API → service_role secret key.
// Never prefix it with VITE_ — that would bundle it into client JS.
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { rateLimit, sweepIfDue, clientIp } from './_lib/rateLimit.js';

export const config = { runtime: 'edge' };

// What the browser sends: the device fingerprint (see
// src/lib/deviceFingerprint.ts), the current user's ID if they're logged
// in, and the full raw details behind the fingerprint (for the admin
// panel's device-session log — useful for a human reviewing suspicious
// activity, even though only the fingerprint itself is used for matching
// against the ban lists).
type ReqBody = {
  fingerprint?: string;
  userId?: string | null;
  details?: {
    platform?: string;
    userAgent?: string;
    language?: string;
    timezone?: string;
    screen?: string;
    hardwareConcurrency?: number;
    deviceMemory?: number | 'unknown';
    gpuVendor?: string;
    gpuRenderer?: string;
    touchSupport?: boolean;
  };
};

// A basic sanity check on the fingerprint we're sent: it should be a
// string of 32-128 hex characters (matching what sha256Hex() in
// deviceFingerprint.ts actually produces). This is a "type guard" —
// TypeScript's special syntax `fp is string` means that anywhere this
// function returns `true`, TypeScript will treat `fp` as confirmed to be
// a string from that point on, without needing another manual check.
function isValidFingerprint(fp: unknown): fp is string {
  return typeof fp === 'string' && /^[a-f0-9]{32,128}$/i.test(fp);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  sweepIfDue();
  const ip = clientIp(req);

  // 30 requests/min/IP is generous for "once per app load" but stops a
  // scripted loop from hammering this endpoint.
  const rl = rateLimit(`track-session:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('[track-session] SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_URL not configured on the server');
    // Fail open on our own misconfiguration — we never want a missing env
    // var to lock every visitor out of the site.
    return new Response(JSON.stringify({ banned: false }), { status: 200 });
  }

  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  if (!isValidFingerprint(body.fingerprint)) {
    return new Response(JSON.stringify({ error: 'Invalid fingerprint' }), { status: 400 });
  }
  const fingerprint = body.fingerprint;
  // Only accept userId if it's actually a non-empty string — otherwise
  // treat this as an anonymous (not-logged-in) visit.
  const userId = typeof body.userId === 'string' && body.userId ? body.userId : null;
  const details = body.details || {};

  // A fresh service-role connection for this one request (see the
  // matching explanation in api/_lib/callerAuth.ts's adminClient — same
  // idea, just built directly here instead of imported, since this file
  // predates that shared helper).
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Check BOTH ban lists at once (IP-based bans and device-fingerprint
  // bans are two separate, independent block-lists an admin can add to).
  // `Promise.all` runs both database lookups in parallel rather than
  // waiting for one to finish before starting the other.
  const [ipBan, deviceBan] = await Promise.all([
    admin.from('banned_ips').select('reason').eq('ip_address', ip).maybeSingle(),
    admin.from('banned_devices').select('reason').eq('device_fingerprint', fingerprint).maybeSingle(),
  ]);

  // Banned if EITHER list has a match.
  const banned = Boolean(ipBan.data || deviceBan.data);
  const reason = ipBan.data?.reason || deviceBan.data?.reason || '';

  // Log the session regardless of ban status — seeing repeated banned
  // attempts (and from which IP/device) is itself useful admin signal.
  try {
    // Look for an existing session row matching this exact
    // IP + fingerprint + user combination (a returning visitor), so we
    // update it instead of creating a fresh duplicate row every single
    // page load.
    let existingQuery = admin
      .from('device_sessions')
      .select('id, hit_count')
      .eq('ip_address', ip)
      .eq('device_fingerprint', fingerprint);
    // `.is('user_id', null)` is the correct way to match "user_id is
    // NULL" in a database query — a plain `.eq('user_id', null)` doesn't
    // work the same way in SQL, so this distinction matters.
    existingQuery = userId ? existingQuery.eq('user_id', userId) : existingQuery.is('user_id', null);
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      // Seen this exact combination before — just bump its "last seen"
      // timestamp and increment the visit counter.
      await admin
        .from('device_sessions')
        .update({
          last_seen_at: new Date().toISOString(),
          hit_count: (existing.hit_count || 1) + 1,
          user_agent: details.userAgent || '',
          platform: details.platform || '',
          browser_info: details,
        })
        .eq('id', existing.id);
    } else {
      // First time seeing this combination — create a new row.
      await admin.from('device_sessions').insert({
        user_id: userId,
        ip_address: ip,
        device_fingerprint: fingerprint,
        user_agent: details.userAgent || '',
        platform: details.platform || '',
        browser_info: details,
      });
    }
  } catch (err) {
    // Never let a logging failure block the visitor's request.
    console.error('[track-session] failed to upsert device_sessions:', err);
  }

  // Tell the browser whether to show the "Access Restricted" screen.
  return new Response(JSON.stringify({ banned, reason }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
