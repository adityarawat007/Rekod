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

const TONE: Record<Row['kind'], string> = {
  log: 'text-white/55',
  net: 'text-sky-300',
  warn: 'text-amber-300',
  error: 'text-red-400',
};

export function Replay() {
  return (
    <div aria-hidden className="relative w-full max-w-lg select-none">
      <div className="overflow-hidden rounded-xl bg-zinc-900 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.7)] ring-1 ring-white/10">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="mono ml-3 truncate text-[11px] text-white/40">shop.example/checkout</span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
            <span className="rk-blink size-1.5 rounded-full bg-white" />
            rec
          </span>
        </div>

        <ol className="mono space-y-0.5 px-2 py-3 text-[11.5px] leading-5">
          {ROWS.map((r, i) => (
            <li
              key={r.t}
              style={{ animationDelay: `${i * 0.7}s` }}
              className={`rk-row flex gap-3 rounded-md px-2 py-1 ${r.kind === 'error' ? 'bg-red-500/12' : ''}`}
            >
              <span className="w-10 shrink-0 text-right tabular-nums text-white/35">{r.t}</span>
              <span className={`w-9 shrink-0 ${TONE[r.kind]}`}>{r.kind}</span>
              <span className={`min-w-0 flex-1 truncate ${r.kind === 'error' ? 'text-white' : 'text-white/80'}`}>
                {r.msg}
              </span>
              {r.tail ? (
                <span className={`shrink-0 tabular-nums ${r.tail.startsWith('5') ? 'text-red-400' : 'text-white/40'}`}>
                  {r.tail}
                </span>
              ) : null}
            </li>
          ))}
        </ol>

        <div className="px-4 pb-4">
          <div className="relative h-1.5 rounded-full bg-white/10">
            <span className="absolute inset-y-0 left-0 w-[62%] rounded-full bg-white/15" />
            <span className="absolute -top-1 left-[48%] h-3.5 w-0.5 rounded-full bg-red-400" />
            <span className="rk-sweep absolute -top-1 size-3.5 -translate-x-1/2 rounded-full border-2 border-zinc-900 bg-white" />
          </div>
        </div>
      </div>

      <div className="rk-stamp absolute -right-3 -top-6 grid size-24 place-items-center rounded-full bg-white text-center text-[15px] font-bold leading-tight text-zinc-950 shadow-[0_6px_0_#000] ring-2 ring-zinc-950 sm:-right-6">
        caught
        <br />
        it!
      </div>
    </div>
  );
}
