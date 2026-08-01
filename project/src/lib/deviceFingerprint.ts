// Device/browser fingerprint used for the admin app's "device ban" feature.
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

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getCanvasSignature(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 220;
    canvas.height = 30;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 60, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('SmartCell-fp', 2, 2);
    return canvas.toDataURL();
  } catch {
    return '';
  }
}

function getWebGLSignature(): { vendor: string; renderer: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return { vendor: '', renderer: '' };
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

export type DeviceDetails = {
  platform: string;
  userAgent: string;
  language: string;
  timezone: string;
  screen: string;
  hardwareConcurrency: number;
  deviceMemory: number | 'unknown';
  gpuVendor: string;
  gpuRenderer: string;
  touchSupport: boolean;
};

export async function collectDeviceInfo(): Promise<{ fingerprint: string; details: DeviceDetails }> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const gpu = getWebGLSignature();

  const details: DeviceDetails = {
    platform: nav.platform || 'unknown',
    userAgent: nav.userAgent || 'unknown',
    language: nav.language || 'unknown',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
    screen: `${screen.width}x${screen.height}x${screen.colorDepth}@${window.devicePixelRatio || 1}`,
    hardwareConcurrency: nav.hardwareConcurrency || 0,
    deviceMemory: nav.deviceMemory ?? 'unknown',
    gpuVendor: gpu.vendor,
    gpuRenderer: gpu.renderer,
    touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
  };

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

  const fingerprint = await sha256Hex(raw);
  return { fingerprint, details };
}
