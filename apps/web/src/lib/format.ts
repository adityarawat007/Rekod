/** Offset in seconds from the recording origin. Negative = pre-roll buffer. */
export const offset = (t: number, t0: number) => (t - t0) / 1000;

export function clock(seconds: number) {
  const s = Math.abs(seconds);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** −0:12 is twelve seconds before record. The sign is information. */
export const stamp = (seconds: number) => (seconds < 0 ? '−' : '') + clock(seconds);

export const ms = (n?: number) =>
  n == null ? '' : n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;

/** A request as the table names it: "https://api.x.com/v1/cart?id=2" →
 *  { name: "cart?id=2", host: "api.x.com" }. No path names it "/". */
export function urlParts(u: string) {
  try {
    const url = new URL(u);
    return { name: (url.pathname.split('/').filter(Boolean).pop() ?? '/') + url.search, host: url.host };
  } catch {
    return { name: u, host: '' };
  }
}

export function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

export const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);

/** A captured URL only if it is http(s), else null. A `javascript:` href
 *  would run in a share-link recipient's session on this origin. */
export function httpUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const { protocol } = new URL(u);
    return protocol === 'http:' || protocol === 'https:' ? u : null;
  } catch {
    return null; // not parseable as a URL, so not linkable
  }
}

/** `s` on [lo, hi] as a clamped percentage; 0, not NaN, for an empty span. */
export const trackPct = (s: number, lo: number, hi: number) =>
  hi > lo ? Math.min(100, Math.max(0, ((s - lo) / (hi - lo)) * 100)) : 0;

/** Re-indents JSON that JSON.parse rejected (a body cut at 4 KB). Only
 *  whitespace between tokens changes; string literals are stepped over. */
export function reindent(src: string): string {
  let out = '';
  let depth = 0;
  let inStr = false;
  let esc = false;
  const nl = () => '\n' + '  '.repeat(depth);
  for (const c of src) {
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    else if (c === '{' || c === '[') { depth++; out += c + nl(); }
    else if (c === '}' || c === ']') { depth = Math.max(0, depth - 1); out += nl() + c; }
    else if (c === ',') out += c + nl();
    else if (c === ':') out += ': ';
    else if (!/\s/.test(c)) out += c;   // the source's own whitespace is redundant now
  }
  return out;
}

/** Every argument single-quoted: captured values are page-controlled, and a
 *  `$(…)` must stay data. Headers are already redacted by redact.js. */
export function toCurl(e: {
  url: string;
  method?: string;
  reqHeaders?: Record<string, string> | null;
  reqBody?: string | null;
}) {
  const q = (s: string) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const parts = [`curl ${q(e.url)}`];
  if (e.method && e.method !== 'GET') parts.push(`-X ${e.method}`);
  for (const [k, v] of Object.entries(e.reqHeaders ?? {})) parts.push(`-H ${q(`${k}: ${v}`)}`);
  if (e.reqBody) parts.push(`--data-raw ${q(e.reqBody)}`);
  return parts.join(' \\\n  ');
}

/** Browser and OS from a UA. Order matters: every Chromium says Chrome and
 *  Chrome says Safari, so Edge → Opera → Chrome → Safari. Unknown is null. */
export function uaSummary(ua?: string | null) {
  if (!ua) return null;
  const v = (re: RegExp) => re.exec(ua)?.[1]?.split('.')[0] ?? '';
  const named = (name: string, re: RegExp) => `${name} ${v(re)}`.trim();

  const browser =
    /Edg[A-Z]?\//.test(ua) ? named('Edge', /Edg[A-Z]?\/(\d+)/)
    : /OPR\//.test(ua) ? named('Opera', /OPR\/(\d+)/)
    : /Chrome\//.test(ua) ? named('Chrome', /Chrome\/(\d+)/)
    : /Firefox\//.test(ua) ? named('Firefox', /Firefox\/(\d+)/)
    : /Safari\//.test(ua) ? named('Safari', /Version\/(\d+)/)
    : null;

  // iPadOS claims to be a Mac, so iPhone/iPad is tested first.
  const os =
    /(iPhone|iPad|iPod)/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? named('Android', /Android (\d+)/)
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows'
    : /(Linux|X11|CrOS)/.test(ua) ? 'Linux'
    : null;

  return { browser, os, apple: /(Mac OS X|iPhone|iPad|iPod)/.test(ua) };
}
