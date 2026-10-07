import { offset, stamp, uaSummary } from './format.ts';
import { isConsole, netFailed, type Entry, type Env, type NetEntry } from './types.ts';

export type MarkdownInput = {
  title: string;
  /** The site; the heading when there is no title. */
  project: string | null;
  /** Absolute. A share link when one exists, else the owner's page. */
  link: string;
  pageUrl: string | null;
  createdAt: string;
  description: string | null;
  env: Env;
  t0: number;
  entries: Entry[];
};

const MAX_ERRORS = 5;
const MAX_NET = 10;
const MAX_MSG = 200;

/** One line, no backticks (they would end the code span), cut at `max`. */
const oneLine = (s: string, max = MAX_MSG) => {
  const t = s.split('\n')[0].replaceAll('`', "'").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** An issue body for a tracker. Pure: everything it says is already on the
 *  report page, and a section with nothing to say is left out. */
export function reportMarkdown(r: MarkdownInput): string {
  const out: string[] = [`## ${oneLine(r.title || r.project || 'Rekod', 200)}`];

  const meta: string[] = [`- Rekod: ${r.link}`];
  if (r.pageUrl ?? r.env.url) meta.push(`- Page: ${r.pageUrl ?? r.env.url}`);
  const d = new Date(r.createdAt);
  if (!Number.isNaN(d.getTime())) meta.push(`- When: ${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`);
  const ua = uaSummary(r.env.ua);
  const browser = ua?.browser ?? r.env.ua;
  if (browser) meta.push(`- Browser: ${browser}`);
  if (ua?.os) meta.push(`- OS: ${ua.os}`);
  if (r.env.viewport) meta.push(`- Window: ${r.env.viewport}${r.env.dpr ? ` @${r.env.dpr}x` : ''}`);
  if (r.env.build) meta.push(`- Build: ${r.env.build}`);
  out.push(meta.join('\n'));

  if (r.description?.trim()) out.push(r.description.trim());

  const errors = r.entries.filter((e) => isConsole(e) && e.lvl === 'error');
  if (errors.length) {
    const rows = errors.slice(0, MAX_ERRORS).map((e) => `- \`${stamp(offset(e.t, r.t0))}\` ${oneLine('msg' in e ? e.msg : '')}`);
    if (errors.length > MAX_ERRORS) rows.push(`- …and ${errors.length - MAX_ERRORS} more`);
    out.push(`### Console errors\n${rows.join('\n')}`);
  }

  // Socket frames are not requests; a failed handshake ('error') still is.
  const failed = r.entries.filter(
    (e): e is NetEntry => e.kind === 'net' && !(e.rtype === 'ws' && (e.ev === 'frame' || e.ev === 'close')) && netFailed(e),
  );
  if (failed.length) {
    const rows = failed.slice(0, MAX_NET).map(
      (e) => `- \`${e.method ?? 'GET'} ${oneLine(e.url, 300)}\` → ${e.status || 'failed'}`,
    );
    if (failed.length > MAX_NET) rows.push(`- …and ${failed.length - MAX_NET} more`);
    out.push(`### Failed requests\n${rows.join('\n')}`);
  }

  return out.join('\n\n') + '\n';
}
