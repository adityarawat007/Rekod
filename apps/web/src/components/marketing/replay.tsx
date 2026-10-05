/** Pure CSS (`rk-*` keyframes in globals.css): no client JS, and reduced
 *  motion shows the finished frame. */
type Row = { t: string; kind: 'log' | 'net' | 'warn' | 'error'; msg: string; tail?: string };

const ROWS: Row[] = [
  { t: '−0:41', kind: 'log', msg: 'cart: 3 items restored' },
  { t: '−0:33', kind: 'net', msg: 'GET /api/cart', tail: '200 · 84ms' },
  { t: '−0:19', kind: 'warn', msg: 'Price changed, recalculating total' },
  { t: '−0:06', kind: 'net', msg: 'POST /api/checkout', tail: '500 · 1.2s' },
  { t: '0:02', kind: 'error', msg: "TypeError: Cannot read properties of undefined (reading 'total')" },
];

// On midnight chrome. Every level is written (§2.6), so the tint only helps.
const TONE: Record<Row['kind'], string> = {
  log: 'text-on-chrome-muted',
  net: 'text-tint',
  warn: 'text-pink',
  error: 'bg-error px-1 text-on-chrome',
};

export function Replay() {
  return (
    <div aria-hidden className="relative w-full max-w-lg select-none">
      <div className="overflow-hidden border border-on-chrome/20 bg-chrome">
        <div className="flex items-center gap-2 border-b border-on-chrome/15 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-on-chrome/20" />
          <span className="size-2.5 rounded-full bg-on-chrome/20" />
          <span className="size-2.5 rounded-full bg-on-chrome/20" />
          <span className="mono ml-3 truncate text-[11px] text-on-chrome-muted">shop.example/checkout</span>
          <span className="label ml-auto flex items-center gap-1.5 bg-error px-2 text-on-chrome">
            <span className="rk-blink size-1.5 rounded-full bg-on-chrome" />
            Rec
          </span>
        </div>

        <ol className="mono space-y-0.5 px-2 py-3 text-[11.5px] leading-5">
          {ROWS.map((r, i) => (
            <li
              key={r.t}
              style={{ animationDelay: `${i * 0.7}s` }}
              className={`rk-row flex gap-3 px-2 py-1 ${r.kind === 'error' ? 'bg-on-chrome/10' : ''}`}
            >
              <span className="w-10 shrink-0 text-right tabular-nums text-on-chrome-muted">{r.t}</span>
              <span className={`label h-fit w-fit shrink-0 ${TONE[r.kind]}`}>{r.kind === 'error' ? 'err' : r.kind}</span>
              <span className="min-w-0 flex-1 truncate text-on-chrome">
                {r.msg}
              </span>
              {r.tail ? (
                <span className={`shrink-0 tabular-nums ${r.tail.startsWith('5') ? 'text-pink' : 'text-on-chrome-muted'}`}>
                  {r.tail}
                </span>
              ) : null}
            </li>
          ))}
        </ol>

        <div className="px-4 pb-4">
          <div className="relative h-1 bg-on-chrome/15">
            <span className="absolute inset-y-0 left-0 w-[62%] bg-on-chrome/30" />
            <span className="absolute -top-0.5 left-[48%] size-2 -translate-x-1/2 bg-error" />
            <span className="rk-sweep absolute -top-1 size-3 -translate-x-1/2 rounded-full bg-on-chrome" />
          </div>
        </div>
      </div>

      <div className="rk-stamp absolute -right-3 -top-6 grid size-24 place-items-center bg-pink text-center text-[15px] font-bold leading-tight text-on-pink sm:-right-6">
        Caught
        <br />
        it!
      </div>
    </div>
  );
}
