// ============================================================================
// Vercel Serverless Function — POST /api/turn-credentials
//
// WHAT THIS FILE IS: provides a TURN server to CallManager.tsx for
// audio/video calls. This file was referenced by the calling code
// (`getIceServers()` fetches it) but didn't actually exist yet — which is
// almost certainly why calls were unreliable/one-directional. Here's why:
//
// WebRTC tries to connect two browsers DIRECTLY to each other (peer-to-peer)
// using "ICE candidates" — possible network paths, discovered with the help
// of a STUN server (which just tells you "here's your public IP/port from
// the outside"). This works fine when both people are on simple home
// networks. It FAILS (or works in only one direction) when either person is
// behind a stricter NAT — common on mobile data, college/office wifi, and
// some routers — because the two browsers genuinely cannot reach each other
// directly no matter how many candidates they exchange.
//
// A TURN server fixes this by acting as a relay: both browsers connect OUT
// to it (which almost always works, even on strict networks), and it
// forwards the audio/video between them. Without one, calls only work when
// both people happen to have "easy" networks — which explains exactly the
// "I can hear them, they can't hear me" pattern (one person's network was
// the blocker; audio flowing the other direction still got lucky via STUN).
//
// Uses Metered.ca's free TURN tier (50GB/month free, no card required).
// Get a free API key at https://www.metered.ca/tools/openrelay/ or
// dashboard.metered.ca, then set these two Vercel environment variables:
//   METERED_SUBDOMAIN   (e.g. "yourapp" if your dashboard URL is yourapp.metered.live)
//   METERED_API_KEY
// Without them, this endpoint responds with `ok: false` and CallManager.tsx
// safely falls back to STUN-only (current behavior) — nothing breaks, calls
// just stay unreliable on strict networks until these are set.
// ============================================================================

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), { status: 405 });
  }

  const subdomain = process.env.METERED_SUBDOMAIN;
  const apiKey = process.env.METERED_API_KEY;

  if (!subdomain || !apiKey) {
    return new Response(
      JSON.stringify({ ok: false, error: 'turn_not_configured', iceServers: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const res = await fetch(
      `https://${subdomain}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`,
    );
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, error: `metered_error_${res.status}`, iceServers: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const iceServers = await res.json();
    return new Response(JSON.stringify({ ok: true, iceServers }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'network_error', iceServers: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
