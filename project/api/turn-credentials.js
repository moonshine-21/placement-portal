// Vercel serverless function: fetches free TURN credentials so calls can
// connect even when one or both people are behind a strict NAT/firewall
// (mobile data, corporate/college networks, etc). Lives at
// /api/turn-credentials.
//
// Why this is needed: STUN alone only works when at least one side can be
// reached directly. When both sides are behind "symmetric" NATs — common on
// cellular networks and many corporate/campus networks — no direct path
// exists and the call hangs on "Connecting…" forever. A TURN server relays
// the media in that case.
//
// This uses Metered's Open Relay TURN service: genuinely free, no credit
// card required, 20 GB/month of relayed traffic. It's capped (every free
// TURN option is, somewhere) but it's Metered's servers taking the exposure
// of being a public relay endpoint — not yours. If you'd rather self-host
// for a higher cap and don't mind that exposure tradeoff, see
// /infra/coturn/README.md instead; this is the lower-effort, zero-exposure
// default.
//
// Setup:
// 1. Sign up free, no card needed: https://dashboard.metered.ca/register
// 2. In the dashboard, go to "TURN Server" — it auto-creates an app for you
//    with a subdomain like "yourappname.metered.live" and shows your API Key.
// 3. In Vercel: Project → Settings → Environment Variables, add:
//      METERED_APP_DOMAIN = yourappname.metered.live   (from step 2)
//      METERED_API_KEY    = <API Key>                  (from step 2)
// 4. Redeploy.
//
// If these env vars are not set, this endpoint returns ok:false and the
// frontend falls back to STUN-only (same as before — same-network calls
// still work, cross-network calls may not).

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ ok: false, reason: "method_not_allowed" });
  }

  const appDomain = process.env.METERED_APP_DOMAIN;
  const apiKey = process.env.METERED_API_KEY;

  if (!appDomain || !apiKey) {
    return res.status(200).json({ ok: false, reason: "no_turn_credentials_configured" });
  }

  try {
    const upstream = await fetch(
      `https://${appDomain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`
    );

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error("turn-credentials: Metered API error", upstream.status, errText);
      return res.status(200).json({ ok: false, reason: "upstream_error", detail: errText.slice(0, 300) });
    }

    const iceServers = await upstream.json();
    if (!Array.isArray(iceServers) || iceServers.length === 0) {
      return res.status(200).json({ ok: false, reason: "malformed_upstream_response" });
    }

    return res.status(200).json({ ok: true, iceServers });
  } catch (err) {
    console.error("turn-credentials failed:", err);
    return res.status(200).json({ ok: false, reason: "request_failed", detail: err.message });
  }
}
