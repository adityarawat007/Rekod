import { Fragment } from 'react';

// Tokenise into React nodes rather than an HTML string — same highlighting the
// old app.js did, without hand-escaping anything.
const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

const CLASS = {
  key: 'text-grape',
  str: 'text-good',
  lit: 'text-chart-2',
  num: 'text-warn',
};

/** Pretty-prints when the body parses as JSON, passes anything else through
 *  untouched — a failed parse must never mangle the payload. */
export function JsonView({ text, pretty = true }: { text?: string | null; pretty?: boolean }) {
  if (text == null || text === '') {
    return <pre className="mono text-xs text-muted-foreground">no body</pre>;
  }

  let src = String(text);
  if (pretty) {
    try {
      src = JSON.stringify(JSON.parse(src), null, 2);
    } catch {
      /* not JSON — show it as sent */
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
    <pre className="mono max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/60 p-3 text-xs leading-relaxed">
      {out.map((n, k) => (
        <Fragment key={k}>{n}</Fragment>
      ))}
    </pre>
  );
}
