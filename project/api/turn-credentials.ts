// ============================================================================
// Vercel Serverless Function — POST /api/turn-credentials
//
// WHAT THIS FILE IS: this file DID NOT EXIST before — that's the main
// reason calling was broken. CallManager.tsx has always fetched
// `/api/turn-credentials` to get TURN relay servers (see the big comment
// block at the top of CallManager.tsx for what a TURN server is and why
// it's needed), but with no file here to handle that route, Vercel
// returned 404 for every single call — which is exactly the error visible
// in the console screenshot ("Failed to load resource: 404 ()
// /api/turn-credentials").
//
// THE CONSEQUENCE OF THAT 404: CallManager.tsx catches the failed fetch
// and quietly falls back to STUN-only (see FALLBACK_ICE_SERVERS there).
// STUN is enough to connect two people on "easy" networks (most home
// WiFi), but it CANNOT punch through the kind of NAT most mobile data
// connections and many office/college networks use. On those networks,
// the call still "connects" at the signaling level (ringing, accept, the
// call screen appears) because that part goes through Supabase, not
// WebRTC — but the actual audio/video never has a path to flow over, so
// the screen sits there with nothing to see or hear. That matches the bug
// report exactly.
//
// THE FIX: actually implement this endpoint. It returns a list of ICE
// servers (STUN + TURN) for the browser to try:
//
//   1. If this project has its OWN TURN provider configured (recommended
//      for production — see the env vars below), use that. Any provider
//      that hands out plain iceServers credentials works (Metered.ca,
//      Twilio, Cloudflare Calls, a self-hosted coturn, etc).
//   2. Otherwise, fall back to the Open Relay Project's free, public TURN
//      servers (openrelay.metered.ca) — no signup or API key needed, and
//      it runs on ports 80/443 (incl. a TCP/TLS option) specifically so it
//      still gets through strict firewalls that block other UDP ports.
//      This has a 20GB/month traffic cap, which is generous for a campus
//      placement app's occasional friend/interview calls, but isn't meant
//      to be the permanent answer for a high-traffic production app —
//      swap in a paid provider via the env vars below once call volume
//      grows.
// ============================================================================

import { rateLimit, sweepIfDue, clientIp } from './_lib/rateLimit.js';

export const config = { runtime: 'edge' };

// ---- Option 1: bring your own TURN provider ----
// Set these in Vercel's Environment Variables to use a dedicated TURN
// service instead of the free fallback below. `TURN_URLS` can be one URL
// or several, comma-separated (e.g. a UDP one and a TCP/443 one).
//   TURN_URLS="turn:your-turn-host:3478,turn:your-turn-host:443?transport=tcp"
//   TURN_USERNAME="..."
//   TURN_CREDENTIAL="..."
function getConfiguredTurnServers(): RTCIceServer[] | null {
  const urls = process.env.TURN_URLS?.split(',').map((u) => u.trim()).filter(Boolean);
  const username = process.env.TURN_USERNAME;
  const credential = process.env.TURN_CREDENTIAL;
  if (urls && urls.length && username && credential) {
    return [{ urls, username, credential }];
  }
  return null;
}

// ---- Option 2: the free fallback (used automatically if Option 1 isn't set) ----
// Google's public STUN (works for a lot of networks on its own) plus the
// Open Relay Project's public TURN server, offered across UDP:80,
// UDP/TCP:443, and TURNS:443 so it has the best possible chance of
// getting through restrictive networks/firewalls too.
const FREE_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:openrelay.metered.ca:80' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405 });
  }

  // Same lightweight per-IP rate limiting used by the other api/ endpoints
  // — nothing sensitive is returned here (the free TURN credentials are
  // public anyway), this is just to stop the endpoint being hammered.
  sweepIfDue();
  const ip = clientIp(req);
  const { allowed, retryAfterMs } = rateLimit(`turn:${ip}`, 30, 60_000);
  if (!allowed) {
    return new Response(JSON.stringify({ ok: false, error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
    });
  }

  const configured = getConfiguredTurnServers();
  const iceServers = configured ?? FREE_ICE_SERVERS;

  return new Response(JSON.stringify({ ok: true, iceServers }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
