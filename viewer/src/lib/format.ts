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
