// Minimal fixed-window rate limiter for edge functions.
//
// HONESTY NOTE: edge functions can run as multiple isolated instances across
// regions, so this in-memory Map is per-instance, not global — a determined
// attacker spread across regions/instances could exceed the nominal limit.
// It is still a real and useful speed bump against casual scripted abuse
// (the overwhelmingly common case), but it is not a substitute for an edge
// WAF / provider-level rate limiting (e.g. Vercel Firewall, Cloudflare) if
// this project ever faces serious volumetric abuse — this is documented here
// deliberately rather than glossed over.

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

// Periodically drop stale buckets so this doesn't grow unbounded on a
// long-lived instance.
let lastSweep = Date.now();
export function sweepIfDue() {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}
