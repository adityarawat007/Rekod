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
