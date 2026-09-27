/** Offset in seconds from the recording origin. Negative = pre-roll buffer. */
export const offset = (t: number, t0: number) => (t - t0) / 1000;

export function clock(seconds: number) {
  const s = Math.abs(seconds);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** −0:12 means twelve seconds before record was pressed. The sign is information. */
export const stamp = (seconds: number) => (seconds < 0 ? '−' : '') + clock(seconds);

export const ms = (n?: number) =>
  n == null ? '' : n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;

export function shortUrl(u: string) {
  try {
    const url = new URL(u);
    return url.pathname.split('/').filter(Boolean).pop() || url.hostname;
  } catch {
    return u;
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

/**
 * A captured URL, but only if it is safe to put in an `href`.
 *
 * `page_url` is whatever the reported page was, and `redact.js` deliberately
 * does not restrict the scheme: `blob:` and `data:` are legitimate in the
 * network log, where URLs are rendered as text. A link is different —
 * `javascript:` in an href executes on THIS origin, and the share page is
 * handed to people who are not the owner, so the author of a report would
 * otherwise be able to run script in a recipient's session.
 *
 * Returns null when there is nothing safe to link to; the caller renders no
 * link at all rather than a dead one.
 */
export function httpUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const { protocol } = new URL(u);
    return protocol === 'http:' || protocol === 'https:' ? u : null;
  } catch {
    return null; // not parseable as a URL, so not linkable
  }
}

/**
 * Where `s` seconds sits on a timeline spanning [lo, hi], as a percentage.
 *
 * Clamped, because the two ends do not agree: the span comes from the log
 * entries, and the video keeps playing past the last one. An unclamped ratio
 * put the progress bar's right edge outside its own container.
 *
 * Returns 0 for an empty or inverted span rather than NaN, which CSS drops
 * silently and which reads as "the bar is missing".
 */
export const trackPct = (s: number, lo: number, hi: number) =>
  hi > lo ? Math.min(100, Math.max(0, ((s - lo) / (hi - lo)) * 100)) : 0;

/**
 * Re-indents JSON-ish text that `JSON.parse` rejected — which in practice means
 * a body `capture.js` cut at its 4 KB ceiling, since redaction re-serializes
 * compact. Minified JSON renders as one unbroken wall of characters otherwise.
 *
 * A pure character walk: it never reorders, drops or re-encodes a byte outside
 * whitespace between tokens, so a truncated payload still reads as what was
 * actually sent. String literals are stepped over, escapes included, so a brace
 * inside a value cannot shift the indent.
 */
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

/**
 * The selected request as a `curl` command, for pasting into a shell.
 *
 * Every argument is single-quoted, because a captured URL or header value is
 * whatever the page sent — a space, a `;` or a `$(…)` in one of them would
 * otherwise be shell syntax rather than data. A single quote is the only
 * character that can end such a string, hence the one replacement.
 *
 * Headers arrive already redacted: `redact.js` runs before capture, so an
 * Authorization value here is a placeholder, not a credential.
 */
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

/**
 * A user agent string reduced to the two facts anyone actually reads off it:
 * which browser, and which OS. The full string stays available as a title —
 * this is a label, not a replacement for the evidence.
 *
 * Order is the whole trick. Every Chromium browser still says `Chrome`, and
 * Chrome still says `Safari`, so the most specific token has to be tested
 * first: Edge before Opera before Chrome before Safari. Anything unrecognised
 * returns null for that half rather than a wrong guess.
 */
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

  // iPadOS reports itself as a Mac in desktop mode, which is why iPhone/iPad
  // is tested before Mac OS X.
  const os =
    /(iPhone|iPad|iPod)/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? named('Android', /Android (\d+)/)
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows'
    : /(Linux|X11|CrOS)/.test(ua) ? 'Linux'
    : null;

  return { browser, os, apple: /(Mac OS X|iPhone|iPad|iPod)/.test(ua) };
}
