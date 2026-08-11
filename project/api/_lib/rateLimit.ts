// ============================================================================
// api/_lib/rateLimit.ts
//
// WHAT THIS FILE IS: a simple "slow down" tool used by our server
// functions (the files in api/) to stop any one visitor from hammering an
// endpoint with too many requests too quickly — e.g. so someone can't
// script 10,000 fake login attempts, or spam the AI-reply endpoint and
// run up a huge Gemini API bill in seconds.
//
// The technique used here is called a "fixed window" rate limiter: for
// each unique "key" (usually a visitor's IP address, combined with which
// endpoint they're hitting), we count how many requests they've made in
// the current time window (e.g. the last 60 seconds), and once they hit
// the limit, we start saying "no" until the window resets.
//
// HONESTY NOTE: edge functions can run as multiple isolated instances across
// regions, so this in-memory Map is per-instance, not global — a determined
// attacker spread across regions/instances could exceed the nominal limit.
// It is still a real and useful speed bump against casual scripted abuse
// (the overwhelmingly common case), but it is not a substitute for an edge
// WAF / provider-level rate limiting (e.g. Vercel Firewall, Cloudflare) if
// this project ever faces serious volumetric abuse — this is documented here
// deliberately rather than glossed over.
// ============================================================================

// A `Map` here works like a dictionary/lookup table: the key is a string
// (e.g. "login:203.0.113.5"), and the value is how many requests that key
// has made recently, plus when that count should reset. This lives in the
// server's memory — it's not saved in the database, and it's forgotten
// entirely if the server instance restarts (which is fine — the worst
// case is someone's limit resets a little early).
const buckets = new Map<string, { count: number; resetAt: number }>();

// The main function: "has this `key` made too many requests?"
//   key       — a unique identifier for who/what we're limiting, e.g. an IP address
//   limit     — how many requests are allowed within the time window
//   windowMs  — how long the time window lasts, in milliseconds
//
// Returns { allowed: true } if this request should go through, or
// { allowed: false, retryAfterMs: ... } if they've hit the limit and
// should be told to wait (retryAfterMs = how many milliseconds until it
// resets).
export function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const bucket = buckets.get(key); // look up this key's current count, if we've seen it before

  // No bucket yet for this key, OR its time window has already expired —
  // start a brand new window, allow this first request through.
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  // Still within the current window, and they've already used up their
  // allowance — reject this request.
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  // Still within the window, and under the limit — allow it, and count it.
  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

// Periodically drop stale buckets so this doesn't grow unbounded on a
// long-lived instance.
//
// Since `buckets` never gets cleaned up automatically, and a busy site
// could see thousands of different visitors, this Map could theoretically
// grow forever if we never removed old entries. So every function that
// uses rate limiting also calls `sweepIfDue()` once, which — at most once
// per minute (see the `lastSweep` check below) — walks through and
// deletes any bucket whose time window has already expired.
let lastSweep = Date.now();
export function sweepIfDue() {
  const now = Date.now();
  // Don't bother sweeping more than once every 60 seconds — walking the
  // whole Map on literally every request would be wasteful.
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}

// Figures out the visitor's IP address from the incoming request. Servers
// behind a proxy/CDN (which Vercel always is) don't see the visitor's real
// IP directly — instead, the proxy adds special headers recording it.
// `x-forwarded-for` can contain a comma-separated CHAIN of IPs (if the
// request passed through multiple proxies) — the first one in that list
// is the original visitor, which is why we split on "," and take just the
// first entry.
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown'; // fallback, in case that specific header isn't present
}
