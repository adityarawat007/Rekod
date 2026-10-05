import { Fragment } from 'react';
import { reindent } from '@/lib/format';

// React nodes, not an HTML string: nothing to escape.
const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

const CLASS = {
  key: 'text-link',
  str: 'text-success',
  lit: 'text-muted-foreground',
  num: 'text-warning',
};

/** Pretty-prints JSON. A body capture.js cut at 4 KB will not parse, so it is
 *  re-indented as written; anything not JSON-shaped passes through untouched. */
export function JsonView({ text, pretty = true }: { text?: string | null; pretty?: boolean }) {
  if (text == null || text === '') {
    return <pre className="mono text-xs text-muted-foreground">no body</pre>;
  }

  let src = String(text);
  let partial = false;
  if (pretty) {
    try {
      src = JSON.stringify(JSON.parse(src), null, 2);
    } catch {
      if (/^\s*[{[]/.test(src)) { src = reindent(src); partial = true; }
    }
  }

  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of src.matchAll(TOKEN)) {
    const at = m.index!;
    if (at > last) out.push(src.slice(last, at));
    const [full, str, colon, lit, num] = m;
    if (str) {
      out.push(
        <span key={i++} className={colon ? CLASS.key : CLASS.str}>
          {str}
        </span>,
      );
      if (colon) out.push(colon);
    } else if (lit) {
      out.push(
        <span key={i++} className={CLASS.lit}>
          {lit}
        </span>,
      );
    } else if (num) {
      out.push(
        <span key={i++} className={CLASS.num}>
          {num}
        </span>,
      );
    }
    last = at + full.length;
  }
  if (last < src.length) out.push(src.slice(last));

  return (
    <div className="space-y-1">
      {partial && (
        <p className="text-xs text-warning">Incomplete JSON: indented as captured, not re-parsed.</p>
      )}
      <pre className="mono max-h-72 overflow-auto whitespace-pre-wrap break-all border bg-bg p-3 text-xs leading-relaxed">
        {out.map((n, k) => (
          <Fragment key={k}>{n}</Fragment>
        ))}
      </pre>
    </div>
  );
}
