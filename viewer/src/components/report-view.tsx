'use client';

import { useMemo, useRef, useState } from 'react';
import { ChevronRight, Monitor, Wifi } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { JsonView } from '@/components/json-view';
import { offset, stamp, ms, shortUrl, clock, trackPct } from '@/lib/format';
import { isConsole, isError, isNet, isWarn, netFailed, type Entry, type Env, type NetEntry, type TimelineEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

type Props = {
  entries: TimelineEntry[];
  t0: number;
  env: Env;
  media: { url: string; kind: 'video' | 'shot' } | null;
};

const RTYPE_LABEL: Record<string, string> = {
  fetch: 'Fetch/XHR', ws: 'WS', js: 'JS', css: 'CSS', font: 'Font',
  img: 'Img', media: 'Media', doc: 'Doc', other: 'Other',
};

const LEVEL_STYLE: Record<string, string> = {
  error: 'text-crit',
  warn: 'text-warn',
  log: 'text-muted-foreground',
  info: 'text-muted-foreground',
  debug: 'text-muted-foreground',
};

function statusClass(status: number) {
  if (status === 0) return 'text-crit';
  if (status >= 500) return 'text-crit';
  if (status >= 400) return 'text-warn';
  return 'text-good';
}

/** A row from the rolling buffer — it happened before record was pressed.
 *  Hatched and dimmed so you can tell at a glance without reading the clock. */
const preRollClass =
  'bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,var(--muted)_5px,var(--muted)_6px)]';

export function ReportView({ entries, t0, env, media }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState(0);
  // The video is usually longer than the last log entry, so it has to be part of
  // the timeline's span or the playhead runs off the end of the track. Infinity
  // is what a MediaRecorder blob reports until it has been seeked, hence the
  // finite check; trackPct clamps whatever is left.
  const [dur, setDur] = useState(0);
  const [showPre, setShowPre] = useState(true);
  const [levels, setLevels] = useState<Set<string>>(new Set(['error', 'warn', 'log']));
  const [netType, setNetType] = useState('all');
  // The expanded network row, by uid. Not the entry itself: seq collides across
  // navigations, so `open?.seq === e.seq` opened two rows at once.
  const [open, setOpen] = useState<number | null>(null);

  const off = (e: Entry) => offset(e.t, t0);
  const seek = (e: Entry) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.max(0, off(e));
    void v.play();
  };

  const { consoleRows, netRows, wsFrames, events, span } = useMemo(() => {
    const cons = entries.filter((e) => isConsole(e) || e.kind === 'event');
    const nets = entries.filter(isNet);
    const lo = Math.min(0, ...entries.map((e) => offset(e.t, t0)));
    const hi = Math.max(1, dur, ...entries.map((e) => offset(e.t, t0)));
    // Frames and the close are detail on the connection row, not rows of their
    // own — a chatty socket would bury everything else. They were being
    // filtered out and then never rendered anywhere, which is indistinguishable
    // from not capturing websockets at all.
    const frames = new Map<number, typeof nets>();
    for (const e of nets) {
      if (e.rtype !== 'ws' || e.ev === 'open' || e.ws == null) continue;
      const a = frames.get(e.ws);
      if (a) a.push(e);
      else frames.set(e.ws, [e]);
    }
    return {
      consoleRows: cons,
      // a socket that never connected has no 'open', so its 'error' is the row
      netRows: nets.filter((e) => e.rtype !== 'ws' || e.ev === 'open' || e.ev === 'error'),
      wsFrames: frames,
      events: entries.filter((e) => e.kind === 'event'),
      span: { lo, hi },
    };
  }, [entries, t0, dur]);

  const visibleConsole = consoleRows.filter((e) => {
    if (!showPre && off(e) < 0) return false;
    if (e.kind === 'event') return true;
    return isConsole(e) && levels.has(e.lvl === 'info' || e.lvl === 'debug' ? 'log' : e.lvl);
  });
  const visibleNet = netRows.filter(
    (e) => (showPre || off(e) >= 0) && (netType === 'all' || e.rtype === netType),
  );

  const preCount = entries.filter((e) => off(e) < 0).length;
  const errN = entries.filter(isError).length;
  const warnN = entries.filter(isWarn).length;

  const pct = (s: number) => trackPct(s, span.lo, span.hi);

  const toggleLevel = (l: string) =>
    setLevels((prev) => {
      const next = new Set(prev);
      next.has(l) ? next.delete(l) : next.add(l);
      return next;
    });

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {/* ── evidence: the capture ─────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="overflow-hidden rounded-lg border bg-black">
          {!media ? (
            <div className="grid h-64 place-items-center text-sm text-muted-foreground">
              No media on this report
            </div>
          ) : media.kind === 'shot' ? (
            <img src={media.url} alt="Screenshot of the reported page" className="w-full" />
          ) : (
            <video
              ref={video}
              src={media.url}
              controls
              preload="metadata"
              className="w-full"
              onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d) && d > 0) setDur(d);
              }}
            />
          )}
        </div>

        {/* one timeline, shared with the log panel */}
        <div className="rounded-lg border p-3">
          <div className="relative h-8">
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
            {span.lo < 0 && (
              <div
                className="absolute top-1/2 h-1 -translate-y-1/2 rounded-l-full bg-border"
                style={{ left: 0, width: `${pct(0)}%` }}
                title="rolling buffer, before record"
              />
            )}
            <div
              className="absolute top-1/2 h-1 -translate-y-1/2 bg-jam/40"
              style={{ left: `${pct(0)}%`, width: `${Math.max(0, pct(now) - pct(0))}%` }}
            />
            {entries
              .filter((e) => e.kind !== 'event')
              .map((e) => {
                const sev = isError(e) ? 'bg-crit' : isWarn(e) ? 'bg-warn' : isNet(e) ? 'bg-chart-2' : null;
                if (!sev) return null;
                return (
                  <button
                    key={e.uid}
                    onClick={() => seek(e)}
                    aria-label={`Jump to ${stamp(off(e))}`}
                    className={cn(
                      'absolute top-1/2 h-3.5 w-[3px] -translate-y-1/2 rounded-full ring-2 ring-card',
                      sev,
                    )}
                    style={{ left: `${pct(off(e))}%` }}
                  />
                );
              })}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span className="mono">{clock(now)}</span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <i className="size-2 rounded-full bg-crit" aria-hidden /> {errN} errors
              </span>
              <span className="flex items-center gap-1.5">
                <i className="size-2 rounded-full bg-warn" aria-hidden /> {warnN} warnings
              </span>
            </span>
            <span className="mono">{env.viewport}{env.dpr ? ` · DPR ${env.dpr}` : ''}</span>
          </div>
        </div>
      </div>

      {/* ── evidence: the logs ────────────────────────────────────────── */}
      <Tabs defaultValue="console" className="min-w-0">
        <TabsList>
          <TabsTrigger value="console">Console {consoleRows.length}</TabsTrigger>
          <TabsTrigger value="network">Network {netRows.length}</TabsTrigger>
          <TabsTrigger value="steps">Steps {events.length}</TabsTrigger>
          <TabsTrigger value="device">Device</TabsTrigger>
        </TabsList>

        {preCount > 0 && (
          <div className="mt-3 flex items-center gap-2.5 rounded-md border bg-muted/40 px-3 py-2 text-xs">
            <Switch
              id="pre"
              checked={showPre}
              onCheckedChange={setShowPre}
              aria-describedby="pre-help"
            />
            <label htmlFor="pre" className="cursor-pointer font-medium">
              Before recording ({preCount})
            </label>
            <span id="pre-help" className="text-muted-foreground">
              from the rolling 5-minute buffer
            </span>
          </div>
        )}

        <TabsContent value="console" className="mt-3">
          <div className="mb-2 flex gap-1.5">
            {(['error', 'warn', 'log'] as const).map((l) => (
              <Badge
                key={l}
                variant={levels.has(l) ? 'default' : 'outline'}
                className="cursor-pointer capitalize"
                render={<button onClick={() => toggleLevel(l)} />}
              >
                {l}
              </Badge>
            ))}
          </div>
          <ScrollArea className="h-[540px] rounded-lg border">
            {visibleConsole.map((e) => (
              <button
                key={e.uid}
                onClick={() => seek(e)}
                className={cn(
                  'flex w-full items-start gap-3 border-b px-3 py-2 text-left text-xs hover:bg-accent/50',
                  off(e) < 0 && preRollClass,
                )}
                title={off(e) < 0 ? 'Before recording started — from the rolling buffer.' : undefined}
              >
                <span className={cn('mono shrink-0 tabular-nums', off(e) < 0 && 'text-muted-foreground')}>
                  {stamp(off(e))}
                </span>
                {e.kind === 'event' ? (
                  <span className="text-chart-2">{e.msg}</span>
                ) : (
                  <span className={cn('min-w-0 flex-1', LEVEL_STYLE[e.lvl])}>
                    <span className="mono whitespace-pre-wrap break-words">{e.msg}</span>
                    {e.stack && (
                      <span className="mono mt-1 block text-[11px] text-muted-foreground">
                        {e.stack}
                      </span>
                    )}
                  </span>
                )}
              </button>
            ))}
            {!visibleConsole.length && (
              <p className="p-6 text-center text-sm text-muted-foreground">Nothing at these levels.</p>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="network" className="mt-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {['all', ...new Set(netRows.map((e) => e.rtype))].map((t) => (
              <Badge
                key={t}
                variant={netType === t ? 'default' : 'outline'}
                className="cursor-pointer"
                render={<button onClick={() => setNetType(t)} />}
              >
                {t === 'all' ? 'All' : (RTYPE_LABEL[t] ?? t)}
              </Badge>
            ))}
          </div>
          <ScrollArea className="h-[540px] rounded-lg border">
            {visibleNet.map((e) => (
              <div key={e.uid} className={cn('border-b', off(e) < 0 && preRollClass)}>
                <button
                  onClick={() => setOpen(open === e.uid ? null : e.uid)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs hover:bg-accent/50"
                >
                  <ChevronRight
                    className={cn('size-3.5 shrink-0 transition-transform', open === e.uid && 'rotate-90')}
                  />
                  <span className="mono shrink-0 text-muted-foreground">{stamp(off(e))}</span>
                  <span className={cn('mono w-9 shrink-0 font-medium', statusClass(e.status))}>
                    {e.status || 'ERR'}
                  </span>
                  <span className="mono w-11 shrink-0 text-muted-foreground">{e.method ?? RTYPE_LABEL[e.rtype]}</span>
                  <span className="mono min-w-0 flex-1 truncate" title={e.url}>
                    {shortUrl(e.url)}
                  </span>
                  <span className="mono shrink-0 text-muted-foreground">{ms(e.ms)}</span>
                </button>
                {open === e.uid && (
                  <div className="space-y-3 border-t bg-muted/20 px-3 py-3">
                    <p className="mono break-all text-[11px] text-muted-foreground">{e.url}</p>
                    {e.rtype === 'ws' ? (
                      <WsFrames frames={wsFrames.get(e.ws ?? -1)} off={off} />
                    ) : (
                      <>
                        <Detail label="Request headers"><JsonView text={JSON.stringify(e.reqHeaders ?? {})} /></Detail>
                        <Detail label="Request body"><JsonView text={e.reqBody} /></Detail>
                        <Detail label="Response headers"><JsonView text={JSON.stringify(e.resHeaders ?? {})} /></Detail>
                        <Detail label="Response body"><JsonView text={e.body} /></Detail>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!visibleNet.length && (
              <p className="p-6 text-center text-sm text-muted-foreground">No requests of this type.</p>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="steps" className="mt-3">
          <div className="rounded-lg border">
            {events.length ? (
              <ol className="divide-y">
                {events.map((e) => (
                  <li key={e.uid} className="flex items-center gap-3 px-3 py-2 text-xs">
                    <span className="mono shrink-0 text-muted-foreground">{stamp(off(e))}</span>
                    <span>{e.msg}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No navigation or visibility events captured. Full repro steps are tier 2.
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="device" className="mt-3">
          <dl className="divide-y rounded-lg border text-sm">
            <Row icon={Monitor} label="Browser" value={env.ua} />
            <Row label="GPU" value={env.gpu ?? 'not reported'} />
            <Row label="Viewport" value={env.viewport} />
            <Row label="DPR" value={env.dpr?.toString()} />
            <Row icon={Wifi} label="Page" value={env.url} />
            <Row label="Build" value={env.build ?? 'no build meta tag'} />
          </dl>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** A websocket's traffic, under its connection row. ↑ sent, ↓ received. Binary
 *  frames arrive from capture.js already described rather than encoded. */
function WsFrames({
  frames,
  off,
}: {
  frames?: (TimelineEntry & NetEntry)[];
  off: (e: Entry) => number;
}) {
  if (!frames?.length) {
    return <p className="text-[11px] text-muted-foreground">No frames after the handshake.</p>;
  }
  return (
    <Detail label={`Frames (${frames.filter((f) => f.ev === 'frame').length})`}>
      <ul className="divide-y rounded border bg-background">
        {frames.map((f) => (
          <li key={f.uid} className="flex gap-2 px-2 py-1 text-[11px]">
            <span className="mono shrink-0 text-muted-foreground">{stamp(off(f))}</span>
            <span
              className={cn(
                'mono w-3 shrink-0',
                f.ev === 'error' ? 'text-crit' : f.dir === 'out' ? 'text-good' : 'text-muted-foreground',
              )}
            >
              {f.ev === 'frame' ? (f.dir === 'out' ? '\u2191' : '\u2193') : f.ev === 'close' ? '\u00d7' : '!'}
            </span>
            <span className="mono min-w-0 flex-1 break-all">
              {f.ev === 'frame'
                ? f.data
                : f.ev === 'close'
                  ? `closed ${f.code ?? ''} ${f.reason ?? ''}`.trim()
                  : 'connection error'}
            </span>
          </li>
        ))}
      </ul>
    </Detail>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ElementType;
  label: string;
  value?: string;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <dt className="flex w-28 shrink-0 items-center gap-2 text-muted-foreground">
        {Icon && <Icon className="size-3.5" aria-hidden />}
        {label}
      </dt>
      <dd className="mono min-w-0 flex-1 break-all text-xs">{value || '—'}</dd>
      <Separator className="sr-only" />
    </div>
  );
}
