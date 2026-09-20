// ============================================================================
// src/lib/deviceFingerprint.ts
//
// WHAT THIS FILE IS: builds a "fingerprint" — a long string of letters and
// numbers that's very likely unique to one particular device/browser —
// used by the admin app's "device ban" feature (see SessionGuard.tsx and
// api/track-session.ts). The idea: even if a banned person creates a
// brand-new account, this fingerprint tends to stay the same, so the ban
// can still catch them.
//
// HONESTY NOTE: a website running in a sandboxed browser tab cannot read a
// machine's real hardware ID (CPU serial, disk serial, MAC address, etc).
// No browser exposes that to JavaScript, on any site, ever — that's a
// deliberate browser security boundary, not a limitation of this code.
// What we *can* build is a stable-ish fingerprint out of signals the
// browser already shares (screen size, timezone, GPU renderer string,
// number of CPU cores, etc). It's a good practical deterrent for repeat
// offenders, but a determined person can change it by clearing site data,
// using a different browser, or using anti-fingerprinting tools. Treat a
// "device ban" the way most large platforms do: a speed bump, not a wall.
// ============================================================================

// Turns any piece of text into a fixed-length string of hex characters
// (like "a3f9c1...") using the SHA-256 hashing algorithm — the same kind
// of one-way scrambling used to store passwords securely. "One-way" means
// you can't reverse it back into the original text; it's just a
// consistent, hard-to-fake summary of the input. `crypto.subtle` is a
// built-in browser tool, not a third-party library.
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input); // convert the text into raw bytes, which is what the hashing function needs
  const digest = await crypto.subtle.digest('SHA-256', data); // actually compute the hash
  // Convert the hash's raw bytes into a readable hex string (each byte
  // becomes 2 hex characters, e.g. 255 → "ff").
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Draws a tiny invisible image using specific fonts/colors/shapes, then
// reads back the resulting image data as text. The trick: due to tiny
// differences in graphics hardware and software between devices, the
// exact pixels produced can differ slightly from device to device — so
// this acts as one more identifying signal, on top of the more obvious
// ones below (screen size, timezone, etc).
function getCanvasSignature(): string {
  try {
    const canvas = document.createElement('canvas'); // create a drawing surface that's never actually shown on the page
    canvas.width = 220;
    canvas.height = 30;
    const ctx = canvas.getContext('2d');
    if (!ctx) return ''; // some very old/unusual browsers might not support this — fail quietly rather than crash
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 60, 20);       // draw a solid rectangle
    ctx.fillStyle = '#069';
    ctx.fillText('SmartCell-fp', 2, 2); // draw some text
    return canvas.toDataURL();          // export the resulting image as a long text string
  } catch {
    return ''; // if anything goes wrong (e.g. blocked by a privacy extension), just skip this signal
  }
}

// Reads identifying info about the device's graphics card (GPU) via
// WebGL, a browser technology for 3D graphics. Different GPU
// vendors/models report different names here (e.g. "Apple M1" vs "Intel
// Iris"), which is another useful identifying signal.
function getWebGLSignature(): { vendor: string; renderer: string } {
  try {
    const canvas = document.createElement('canvas');
    // Try the modern WebGL context name first, falling back to the older
    // 'experimental-webgl' name some older browsers used.
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return { vendor: '', renderer: '' };
    // This specific piece of info is hidden behind an "extension" that
    // not every browser enables (some browsers disable it on purpose, for
    // privacy) — if it's not available, we just get back empty strings.
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return { vendor: '', renderer: '' };
    return {
      vendor: String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || ''),
      renderer: String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || ''),
    };
  } catch {
    return { vendor: '', renderer: '' };
  }
}

// The full list of raw signals we collect about a device, before they get
// combined and hashed into the final single fingerprint string.
export type DeviceDetails = {
  platform: string;               // e.g. "Win32", "MacIntel"
  userAgent: string;               // the browser's self-reported name/version string
  language: string;                // the browser's language setting, e.g. "en-US"
  timezone: string;                // e.g. "Asia/Kolkata"
  screen: string;                  // screen resolution + color depth + pixel density, combined into one string
  hardwareConcurrency: number;     // how many CPU cores the browser reports
  deviceMemory: number | 'unknown'; // roughly how much RAM the device has, in GB (not all browsers report this)
  gpuVendor: string;
  gpuRenderer: string;
  touchSupport: boolean;           // does this device support touch input? (phones/tablets vs. desktop)
};

// The main function this file exports — called once per page load (by
// SessionGuard.tsx) to gather everything above and combine it into one
// final fingerprint string.
export async function collectDeviceInfo(): Promise<{ fingerprint: string; details: DeviceDetails }> {
  // `deviceMemory` isn't part of the standard TypeScript "Navigator" type
  // definition (since not all browsers support it), so we tell TypeScript
  // "trust me, this property might also exist" using this cast.
  const nav = navigator as Navigator & { deviceMemory?: number };
  const gpu = getWebGLSignature();

  // Gather every individual signal into one object.
  const details: DeviceDetails = {
    platform: nav.platform || 'unknown',
    userAgent: nav.userAgent || 'unknown',
    language: nav.language || 'unknown',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
    screen: `${screen.width}x${screen.height}x${screen.colorDepth}@${window.devicePixelRatio || 1}`,
    hardwareConcurrency: nav.hardwareConcurrency || 0,
    deviceMemory: nav.deviceMemory ?? 'unknown', // `??` means "use this value, unless it's null/undefined, then use 'unknown' instead"
    gpuVendor: gpu.vendor,
    gpuRenderer: gpu.renderer,
    // True if this device supports touch input at all — either through
    // the older 'ontouchstart' browser feature, or the newer
    // `navigator.maxTouchPoints` count being greater than zero.
    touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
  };

  // Combine every single signal into one long piece of text, each part
  // separated by "||" so they can't accidentally blend into each other
  // (e.g. so "abc" + "def" doesn't look the same as "ab" + "cdef").
  const raw = [
    details.platform,
    details.userAgent,
    details.language,
    details.timezone,
    details.screen,
    details.hardwareConcurrency,
    details.deviceMemory,
    details.gpuVendor,
    details.gpuRenderer,
    details.touchSupport,
    getCanvasSignature(),
  ].join('||');

  // Hash that combined text down into one fixed-length fingerprint string
  // — this is the actual value stored/compared for the ban system.
  const fingerprint = await sha256Hex(raw);
  return { fingerprint, details };
}
