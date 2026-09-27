/**
 * The login page's one loud thing: a tiny replay of what ReKod actually keeps —
 * the console and network rows leading up to a bug, with the product's own
 * `−0:41` pre-roll stamps — and a sticker when the error lands.
 *
 * Pure CSS (keyframes in globals.css, `rk-*`), so it costs no client JS and
 * stops dead under prefers-reduced-motion, showing the finished frame instead.
 * Decorative: the whole panel is aria-hidden.
 */
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
  net: 'text-[#A98BFF]',
  warn: 'text-zest',
  error: 'text-[#FF4E71]',
};

export function Replay() {
  return (
    <div aria-hidden className="relative w-full max-w-lg select-none">
      {/* The recording: a window onto somebody's broken checkout. */}
      <div className="overflow-hidden rounded-xl bg-[#1A1420] shadow-[0_24px_60px_-20px_rgb(26_20_32/0.7)] ring-1 ring-white/10">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="mono ml-3 truncate text-[11px] text-white/40">shop.example/checkout</span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-jam px-2 py-0.5 text-[10px] font-semibold text-white">
            <span className="rk-blink size-1.5 rounded-full bg-white" />
            rec
          </span>
        </div>

        <ol className="mono space-y-0.5 px-2 py-3 text-[11.5px] leading-5">
          {ROWS.map((r, i) => (
            <li
              key={r.t}
              style={{ animationDelay: `${i * 0.7}s` }}
              className={`rk-row flex gap-3 rounded-md px-2 py-1 ${r.kind === 'error' ? 'bg-[#FF4E71]/12' : ''}`}
            >
              <span className="w-10 shrink-0 text-right tabular-nums text-white/35">{r.t}</span>
              <span className={`w-9 shrink-0 ${TONE[r.kind]}`}>{r.kind}</span>
              <span className={`min-w-0 flex-1 truncate ${r.kind === 'error' ? 'text-white' : 'text-white/80'}`}>
                {r.msg}
              </span>
              {r.tail ? (
                <span className={`shrink-0 tabular-nums ${r.tail.startsWith('5') ? 'text-[#FF4E71]' : 'text-white/40'}`}>
                  {r.tail}
                </span>
              ) : null}
            </li>
          ))}
        </ol>

        {/* The track: five minutes of buffer, a playhead, and a tick where it broke. */}
        <div className="px-4 pb-4">
          <div className="relative h-1.5 rounded-full bg-white/10">
            <span className="absolute inset-y-0 left-0 w-[62%] rounded-full bg-white/15" />
            <span className="absolute -top-1 left-[48%] h-3.5 w-0.5 rounded-full bg-[#FF4E71]" />
            <span className="rk-sweep absolute -top-1 size-3.5 -translate-x-1/2 rounded-full border-2 border-[#1A1420] bg-white" />
          </div>
        </div>
      </div>

      {/* The payoff. */}
      <div className="rk-stamp absolute -right-3 -top-6 grid size-24 place-items-center rounded-full bg-zest text-center font-heading text-[15px] font-extrabold leading-tight text-[#1A1420] shadow-[0_6px_0_#1A1420] ring-2 ring-[#1A1420] sm:-right-6">
        caught
        <br />
        it!
      </div>
    </div>
  );
}
