import { bytes } from '@/lib/format';
import type { AdminStats } from '@/lib/server/admin';

/** The read-only half of /admin. Server components: no state, and the hover
 *  labels on the bars are CSS. One hue (primary) throughout — every chart here
 *  is a single series, so colour never has to carry identity. */

const n = (x: number) => x.toLocaleString('en');

function Panel({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border bg-panel p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-semibold">{title}</h2>
        {note ? <p className="mono text-xs text-muted-foreground">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function StatTiles({ stats: s }: { stats: AdminStats }) {
  const used = Object.values(s.bytes).reduce((a, b) => a + (b ?? 0), 0);
  const tiles: [string, string, string?][] = [
    ['Users', n(s.users), `+${n(s.users7)} this week · +${n(s.users30)} in 30 days`],
    ['On Pro', n(s.pro), s.users ? `${Math.round((100 * s.pro) / s.users)}% of users` : undefined],
    ['Workspaces', n(s.workspaces)],
    ['Rekods', n(s.videos + s.screenshots), `${n(s.videos)} videos · ${n(s.screenshots)} screenshots`],
    ['Share links on', n(s.shared)],
    ['Unfinished uploads', n(s.processing), 'Deleted by the daily cleanup after a day'],
    ['Storage used', bytes(used), s.unsized ? `${n(s.unsized)} older files not counted` : 'Every file in the bucket'],
    ['Database', bytes(s.dbBytes)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-px border bg-line sm:grid-cols-4">
      {tiles.map(([label, value, sub]) => (
        <div key={label} className="space-y-1 bg-panel p-4">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-2xl font-semibold tracking-tight tabular-nums">{value}</dd>
          {sub ? <dd className="text-xs text-muted-foreground">{sub}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** 30 days of one count. Bars with a 2px gap, a hover label each, and the
 *  same numbers as a table for screen readers. */
export function DayBars({ title, unit, days }: { title: string; unit: string; days: { day: string; n: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.n));
  const total = days.reduce((a, d) => a + d.n, 0);
  const label = (d: { day: string; n: number }) =>
    `${new Date(d.day + 'T00:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })}: ${n(d.n)} ${unit}${d.n === 1 ? '' : 's'}`;
  return (
    <Panel title={title} note={`${n(total)} in 30 days · UTC`}>
      <div className="flex gap-3">
        <div className="mono flex flex-col justify-between pb-5 text-right text-[11px] text-muted-foreground" aria-hidden>
          <span>{n(max)}</span>
          <span>0</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex h-40 items-end gap-[2px] border-b border-line-strong" aria-hidden>
            {days.map((d) => (
              <div key={d.day} className="group relative flex h-full min-w-0 flex-1 items-end">
                {/* The hit area is the whole column, not the bar. */}
                <div className="w-full bg-primary group-hover:bg-primary-hover" style={{ height: `${(100 * d.n) / max}%` }} />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap border bg-panel px-2 py-1 text-xs text-ink group-hover:block">
                  {label(d)}
                </span>
              </div>
            ))}
          </div>
          <div className="mono mt-1.5 flex justify-between text-[11px] text-muted-foreground" aria-hidden>
            <span>{label(days[0]).split(':')[0]}</span>
            <span>Today</span>
          </div>
        </div>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>{days.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.n}</td></tr>)}</tbody>
      </table>
    </Panel>
  );
}

/** Horizontal bars, longest first; the value is text beside the bar. */
function Bars({ rows }: { rows: { label: string; value: number; text: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate" title={r.label}>{r.label}</span>
          <span className="h-2.5 bg-bg" aria-hidden>
            <span className="block h-full bg-primary" style={{ width: `${(100 * r.value) / max}%` }} />
          </span>
          <span className="mono text-xs tabular-nums text-muted-foreground">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

const KINDS = [['video', 'Videos'], ['screenshot', 'Screenshots'], ['poster', 'Thumbnails'], ['logs', 'Console logs'], ['network', 'Network logs']] as const;

export function StorageBars({ stats: s }: { stats: AdminStats }) {
  const used = Object.values(s.bytes).reduce((a, b) => a + (b ?? 0), 0);
  const rows = KINDS.map(([k, label]) => ({ label, value: s.bytes[k] ?? 0, text: bytes(s.bytes[k] ?? 0) }))
    .sort((a, b) => b.value - a.value);
  return (
    <Panel title="Storage" note={`${bytes(used)} in the bucket`}>
      <Bars rows={rows} />
      {s.unsized ? (
        <p className="text-xs text-muted-foreground">
          {n(s.unsized)} files uploaded before sizes were recorded are not counted. Run{' '}
          <code className="mono text-ink">pnpm backfill-sizes</code> once to add them.
        </p>
      ) : null}
    </Panel>
  );
}

export function SiteBars({ sites }: { sites: { project: string; count: number }[] }) {
  return (
    <Panel title="Top sites recorded" note="Across every workspace">
      {sites.length ? (
        <Bars rows={sites.map((s) => ({ label: s.project, value: s.count, text: n(s.count) }))} />
      ) : (
        <p className="text-sm text-muted-foreground">No rekods yet.</p>
      )}
    </Panel>
  );
}
