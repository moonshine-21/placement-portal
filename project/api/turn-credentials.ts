// TURN/STUN credentials endpoint for video/voice calls (CallManager.tsx).
//
// Priority:
//   1. Metered.ca  — set METERED_API_KEY and METERED_APP_NAME in Vercel
//      (METERED_APP_NAME is the part before ".metered.live" in your Metered
//      dashboard URL, e.g. "myapp" for myapp.metered.live). We call Metered's
//      credentials API server-side so the key never reaches the browser.
//   2. Manual TURN — TURN_URLS (comma-separated), TURN_USERNAME, TURN_CREDENTIAL.
//   3. Nothing configured — returns an empty list and the client falls back to
//      public STUN only (works on open networks, fails behind strict NATs).

export const config = { runtime: 'edge' };

type IceServer = { urls: string | string[]; username?: string; credential?: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Accepts "myapp", "myapp.metered.live" or "https://myapp.metered.live/".
function meteredHost(raw: string): string {
  let h = raw.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  if (!h) return '';
  if (!h.includes('.')) h = `${h}.metered.live`;
  return h;
}

async function fetchMetered(): Promise<{ servers: IceServer[]; error?: string } | null> {
  const apiKey = (process.env.METERED_API_KEY || process.env.VITE_METERED_API_KEY || '').trim();
  const host = meteredHost(
    process.env.METERED_APP_NAME || process.env.METERED_DOMAIN || process.env.VITE_METERED_APP_NAME || ''
  );
  if (!apiKey) return null;
  if (!host) return { servers: [], error: 'METERED_API_KEY is set but METERED_APP_NAME is missing' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`https://${host}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`, {
      signal: ctrl.signal,
    });
    if (!res.ok) return { servers: [], error: `Metered responded ${res.status}` };
    const data = await res.json();
    if (!Array.isArray(data)) return { servers: [], error: 'Unexpected Metered response' };
    return { servers: data as IceServer[] };
  } catch (err) {
    return { servers: [], error: `Could not reach Metered: ${(err as Error).message}` };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  const iceServers: IceServer[] = [];
  let note = '';

  const metered = await fetchMetered();
  if (metered) {
    iceServers.push(...metered.servers);
    if (metered.error) {
      console.error('[turn-credentials]', metered.error);
      note = metered.error;
    }
  }

  // Manual TURN (also used as a fallback if Metered failed).
  const urls = (process.env.TURN_URLS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const username = process.env.TURN_USERNAME || '';
  const credential = process.env.TURN_CREDENTIAL || '';
  if (urls.length && username && credential) {
    iceServers.push({ urls, username, credential });
  }

  if (!iceServers.length && !note) {
    note = 'No TURN configured — set METERED_API_KEY + METERED_APP_NAME in Vercel. Clients use public STUN only.';
  }

  return json({ ok: true, iceServers, note: note || 'TURN credentials provided' });
}
