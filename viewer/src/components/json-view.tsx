import { Fragment } from 'react';
import { reindent } from '@/lib/format';

// Tokenise into React nodes rather than an HTML string — same highlighting the
// old app.js did, without hand-escaping anything.
const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

const CLASS = {
  key: 'text-grape',
  str: 'text-good',
  lit: 'text-chart-2',
  num: 'text-warn',
};

/** Pretty-prints when the body parses as JSON. When it does not — nearly always
 *  a payload capture.js cut at 4 KB — it falls back to re-indenting the text as
 *  written, which is the difference between a readable object and one 4,000
 *  character line. Anything that is not JSON-shaped is passed through
 *  untouched: a failed parse must never mangle the payload. */
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
      // Only when it opens like JSON. Re-indenting prose or HTML on its
      // punctuation would be worse than leaving it alone.
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
        <p className="text-[11px] text-warn">Incomplete JSON — indented as captured, not re-parsed.</p>
      )}
      <pre className="mono max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/60 p-3 text-xs leading-relaxed">
        {out.map((n, k) => (
          <Fragment key={k}>{n}</Fragment>
        ))}
      </pre>
    </div>
  );
}
