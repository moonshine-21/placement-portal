// Optional TURN credentials endpoint.
// Returns STUN-only if no TURN env is configured — CallManager already
// falls back gracefully, but a 200 here avoids noisy 404s in the console.

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405 });
  }

  // Optional: set TURN_URLS (comma-separated), TURN_USERNAME, TURN_CREDENTIAL
  // in Vercel env to enable relay for restrictive networks.
  const urls = (process.env.TURN_URLS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const username = process.env.TURN_USERNAME || '';
  const credential = process.env.TURN_CREDENTIAL || '';

  const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [];
  if (urls.length && username && credential) {
    iceServers.push({ urls, username, credential });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      iceServers,
      note: iceServers.length
        ? 'TURN credentials provided'
        : 'No TURN configured — clients use public STUN only',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
