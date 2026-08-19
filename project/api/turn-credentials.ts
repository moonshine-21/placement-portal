// ============================================================================
// Vercel Serverless Function — POST /api/turn-credentials
//
// WHAT THIS FILE IS: fetches short-lived TURN relay credentials from
// Metered (metered.ca) and hands them to the browser for use in WebRTC
// calls (see src/components/CallManager.tsx's getIceServers(), which was
// already written to call this exact endpoint — it just never existed
// until now, so every call was silently falling back to STUN-only).
//
// WHY THIS MATTERS: STUN alone lets two browsers find each other and
// connect directly ONLY when at least one side's network allows a direct
// peer-to-peer connection through. Some networks (many college/campus
// wifi setups, some mobile carriers, strict corporate firewalls) block
// this entirely — in that case a TURN server is the only thing that lets
// the call work at all, by relaying the audio/video through a third-party
// server instead of a direct connection. Without TURN, calls between two
// people on such networks would simply never connect, no matter how the
// rest of the calling code is written.
//
// Metered's credentials are short-lived and generated fresh per request
// specifically so the underlying secret (METERED_API_KEY) never has to be
// sent to the browser — the browser only ever receives a temporary
// username/password pair good for a limited time, never the real API key.
//
// SETUP: sign up for a free account at https://www.metered.ca/tools/openrelay/
// (or the paid dashboard at https://dashboard.metered.ca if you need more
// than the free tier's relay minutes), create a TURN "app," and you'll be
// given both a subdomain (looks like "yourapp.metered.live") and an API
// key. Set both as METERED_DOMAIN and METERED_API_KEY in Vercel's
// Environment Variables — never prefix either with VITE_, which would
// bundle the secret key into public JS.
// ============================================================================

import { adminClient, resolveCaller } from './_lib/callerAuth.js';
import { rateLimit, sweepIfDue, clientIp } from './_lib/rateLimit.js';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  // Generating TURN credentials has a real cost against Metered's relay
  // minutes, so this is both rate-limited AND requires a real signed-in
  // user (see below) — unlike some other endpoints in this app, calling
  // is never a feature anonymous/logged-out visitors need.
  sweepIfDue();
  const rl = rateLimit(`turn-credentials:${clientIp(req)}`, 20, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ ok: false, error: 'Too many requests' }), {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
  }

  const admin = adminClient();
  if (!admin) {
    // Fail quiet, not loud: CallManager.tsx already treats any non-`ok`
    // response as "fall back to STUN-only," so calls still work (just
    // with a lower success rate on strict networks) even if this
    // endpoint's own setup is incomplete.
    return new Response(JSON.stringify({ ok: false }), { status: 200 });
  }

  const caller = await resolveCaller(req, admin);
  if (!caller) {
    return new Response(JSON.stringify({ ok: false, error: 'Not signed in' }), { status: 401 });
  }

  const domain = process.env.METERED_DOMAIN;
  const apiKey = process.env.METERED_API_KEY;
  if (!domain || !apiKey) {
    // Not configured — this is a normal, expected state if you haven't
    // set up Metered yet, not an error. STUN-only fallback handles it.
    return new Response(JSON.stringify({ ok: false }), { status: 200 });
  }

  try {
    const meteredRes = await fetch(
      `https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`
    );
    if (!meteredRes.ok) {
      console.error('[turn-credentials] Metered API returned', meteredRes.status);
      return new Response(JSON.stringify({ ok: false }), { status: 200 });
    }
    // Metered's response is a plain JSON array of ICE server objects —
    // e.g. [{ urls: "stun:...", ... }, { urls: "turn:...", username: "...",
    // credential: "..." }, ...] — already in the exact shape the browser's
    // RTCPeerConnection expects, so we pass it through as-is.
    const iceServers = await meteredRes.json();
    if (!Array.isArray(iceServers)) {
      console.error('[turn-credentials] unexpected response shape from Metered');
      return new Response(JSON.stringify({ ok: false }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true, iceServers }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[turn-credentials] failed to fetch from Metered:', err);
    return new Response(JSON.stringify({ ok: false }), { status: 200 });
  }
}
