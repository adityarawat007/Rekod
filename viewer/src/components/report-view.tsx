'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Apple, AppWindow, Clock, Cpu, ExternalLink, Globe, Hammer, Maximize,
  Minimize, Monitor, Pause, Play, Ruler, Search, Tag, Timer,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { NetworkPane } from '@/components/network-pane';
import { offset, stamp, clock, trackPct, httpUrl, uaSummary } from '@/lib/format';
import { isConsole, isError, isNet, isWarn, netFailed, type Entry, type Env, type TimelineEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

type Props = {
  entries: TimelineEntry[];
  t0: number;
  env: Env;
  media: { url: string; kind: 'video' | 'shot' } | null;
  /** What the Info tab says about the recording itself. `env` covers the
   *  machine; this covers the page and the clock. */
  info: { project: string | null; pageUrl: string | null; createdAt: string };
  /** False on a share link created as "video only": the log pane is left out
   *  entirely and the capture column gets the width. */
  showLog?: boolean;
  /** Rendered under the transport, in the scrolling left column: the title,
   *  the description and the comment thread. Passed in rather than imported so
   *  this stays the player and the log, and the two pages that use it can put
   *  different things there — the share page's copy is read-only. */
  children?: React.ReactNode;
};

const LEVEL_STYLE: Record<string, string> = {
  error: 'text-crit',
  warn: 'text-warn',
  log: 'text-muted-foreground',
  info: 'text-muted-foreground',
  debug: 'text-muted-foreground',
};

/** The pane fills whatever height its tab panel was given. The column, not the
 *  content, decides how tall the log is — on xl that is the viewport. */
const PANE_H = 'min-h-0 flex-1';

export function ReportView({ entries, t0, env, media, info, showLog = true, children }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState(0);
  // The video is usually longer than the last log entry, so it has to be part of
  // the timeline's span or the playhead runs off the end of the track.
  const [dur, setDur] = useState(0);
  const [ready, setReady] = useState(false);
  const [broken, setBroken] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [levels, setLevels] = useState<Set<string>>(new Set(['error', 'warn', 'log']));
  const [query, setQuery] = useState('');

  // True while the duration probe below is mid-seek: currentTime is 1e101 then,
  // and letting that reach `now` throws the playhead off the end of the track.
  const probing = useRef(false);

  /**
   * offscreen.js pipes MediaRecorder chunks straight into a Blob, so the webm
   * carries no duration in its header and Chrome reports `Infinity` — which it
   * also paints as a scrubber pinned to the far right, so every recording looked
   * like it had already finished. Seeking past the end forces Chrome to compute
   * the real duration; `durationchange` then puts the playhead back at 0.
   * Fixing it here rather than in the extension keeps recordings already in the
   * bucket playable, and keeps a bundler out of `extension/`.
   */
  const onMeta = (v: HTMLVideoElement) => {
    if (Number.isFinite(v.duration) && v.duration > 0) return setDur(v.duration);
    if (probing.current) return; // one probe, or a file with no duration loops
    probing.current = true;
    v.currentTime = 1e101;
  };

  const onDurationChange = (v: HTMLVideoElement) => {
    if (!Number.isFinite(v.duration) || v.duration <= 0) return;
    setDur(v.duration);
    if (probing.current) {
      probing.current = false;
      v.currentTime = 0;
    }
  };

  const off = (e: Entry) => offset(e.t, t0);
  const seekTo = (s: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.max(0, s);
  };
  const seek = (e: Entry) => {
    seekTo(off(e));
    void video.current?.play();
  };
  /**
   * "Fullscreen" is a modal, not the Fullscreen API — and it is the same
   * <video> element either way, promoted to a fixed overlay by className.
   *
   * That is the whole trick: rendering the player a second time inside a
   * dialog would mount a second <video>, which starts at 0:00 with an empty
   * buffer. Re-styling the node that is already playing keeps the frame, the
   * playhead and the transport exactly where they were.
   */
  const stage = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);

  // Esc closes it, and the page behind it does not scroll while it is open.
  useEffect(() => {
    if (!full) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    document.addEventListener('keydown', key);
    const { overflow } = document.documentElement.style;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', key);
      document.documentElement.style.overflow = overflow;
    };
  }, [full]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
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
    if (query && !('msg' in e && e.msg.toLowerCase().includes(query.toLowerCase()))) return false;
    if (e.kind === 'event') return true;
    return isConsole(e) && levels.has(e.lvl === 'info' || e.lvl === 'debug' ? 'log' : e.lvl);
  });
  const visibleNet = netRows;

  const errN = entries.filter(isError).length;
  const warnN = entries.filter(isWarn).length;
  const netErrN = netRows.filter(netFailed).length;

  const pct = (s: number) => trackPct(s, span.lo, span.hi);

  // `page_url` is the column, `env.url` is what the tab reported — the same
  // string in practice, and either may be missing on an old report.
  const page = info.pageUrl ?? env.url;
  const ua = uaSummary(env.ua);

  const toggleLevel = (l: string) =>
    setLevels((prev) => {
      const next = new Set(prev);
      next.has(l) ? next.delete(l) : next.add(l);
      return next;
    });

  return (
    // Two columns that own the viewport on a wide screen: the capture and
    // everything written about it scrolls on the left, the log holds still on
    // the right. Below xl they stack and the page scrolls as one, which is why
    // the height rules are all xl:-prefixed.
    <div className={cn('grid min-h-0 flex-1 gap-6 xl:overflow-hidden', showLog && 'xl:grid-cols-2')}>
      {/* ── evidence: the capture, and the writing about it ───────────── */}
      {/* `-mx-2 px-2` is not decoration: `overflow-y-auto` clips the horizontal
          axis too, and the title and description fields deliberately bleed 8px
          outside the content box so their hover and focus states sit around
          the text rather than beside it. Without the room, the focus ring is
          sliced off at the column's edge. The padding puts the room inside the
          scroll box; the negative margin takes it back out of the layout, so
          nothing moves. */}
      <div
        className={cn(
          '-mx-2 flex min-w-0 flex-col gap-3 px-2 xl:min-h-0 xl:overflow-y-auto',
          !showLog && 'mx-auto w-full max-w-3xl',
        )}
      >
        {/* The stage: the picture and its transport, and the thing that turns
            into the modal. It is one element in both states — see the note on
            `full` above for why this is not a second player in a dialog. */}
        <div
          ref={stage}
          role={full ? 'dialog' : undefined}
          aria-modal={full || undefined}
          aria-label={full ? 'Recording' : undefined}
          // Clicking the backdrop — the stage itself, never a child — closes.
          onClick={full ? (e) => e.target === stage.current && setFull(false) : undefined}
          className={cn(
            'flex shrink-0 flex-col gap-3',
            full && 'fixed inset-0 z-50 bg-background/95 p-4 backdrop-blur md:p-8',
          )}
        >
        {/* Fixed box: a <video> has no intrinsic size until its metadata lands,
            so without one the player collapses to nothing and the page jumps
            when it finally loads. shrink-0, or a long comment thread squeezes
            the player instead of scrolling the column — flex children shrink
            before they overflow. */}
        <div
          onDoubleClick={media ? () => setFull((v) => !v) : undefined}
          className={cn(
            'relative overflow-hidden rounded-lg border bg-black',
            full ? 'min-h-0 flex-1' : 'aspect-video shrink-0',
          )}
        >
          {!media ? (
            <div className="grid size-full place-items-center text-sm text-muted-foreground">
              No media on this report
            </div>
          ) : media.kind === 'shot' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.url}
              alt="Screenshot of the reported page"
              className="size-full object-contain"
              onLoad={() => setReady(true)}
              onError={() => setBroken(true)}
            />
          ) : (
            <video
              ref={video}
              src={media.url}
              playsInline
              preload="metadata"
              className="size-full object-contain"
              onTimeUpdate={(e) => {
                if (!probing.current) setNow(e.currentTarget.currentTime);
              }}
              onLoadedMetadata={(e) => onMeta(e.currentTarget)}
              onDurationChange={(e) => onDurationChange(e.currentTarget)}
              onLoadedData={() => setReady(true)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onError={() => setBroken(true)}
            />
          )}

          {media && !ready && !broken && (
            <div className="absolute inset-0 animate-pulse bg-muted/20" aria-hidden />
          )}

          {media && (
            <Button
              size="icon-sm"
              onClick={() => setFull((v) => !v)}
              aria-label={full ? 'Close the large player' : 'Open the large player'}
              title={full ? 'Close (Esc)' : 'Expand — or double-click the picture'}
              className="absolute right-2 top-2 z-20 border-0 bg-black/55 text-white backdrop-blur hover:bg-black/80"
            >
              {full ? <Minimize /> : <Maximize />}
            </Button>
          )}

          {broken && (
            <div className="absolute inset-0 grid place-items-center gap-2 bg-background/95 p-6 text-center">
              <AlertTriangle className="mx-auto size-5 text-warn" aria-hidden />
              <p className="text-sm font-medium">This recording would not load</p>
              <p className="text-xs text-muted-foreground">
                Media links are signed for an hour. Reload the page for a fresh one — the log below
                is unaffected.
              </p>
              <Button size="sm" variant="outline" onClick={() => location.reload()}>
                Reload
              </Button>
            </div>
          )}
        </div>

        {/* One transport for one timeline. The native <video> controls scrubbed
            the recording only, while this track spans the rolling buffer too —
            two scrubbers that disagreed about where "the start" is. */}
        <div className="shrink-0 rounded-lg border p-3">
          <div className="flex items-center gap-3">
            <Button
              size="icon-sm"
              variant="outline"
              onClick={toggle}
              disabled={media?.kind !== 'video' || broken}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause /> : <Play />}
            </Button>
            <span className="mono shrink-0 text-xs tabular-nums">{clock(now)}</span>

            <div className="relative h-8 flex-1">
              <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
              <div
                className="absolute top-1/2 h-1 -translate-y-1/2 bg-jam/40"
                style={{ left: `${pct(0)}%`, width: `${Math.max(0, pct(now) - pct(0))}%` }}
              />

              {/* The scrubber is a real range input: dragging, arrow keys and a
                  focus ring come with the element. Its own thumb is hidden — the
                  playhead below is the visible one. */}
              <input
                type="range"
                className="peer absolute inset-0 w-full cursor-pointer appearance-none bg-transparent opacity-0"
                min={span.lo}
                max={span.hi}
                step={0.05}
                value={now}
                disabled={media?.kind !== 'video' || broken}
                onChange={(e) => seekTo(Number(e.target.value))}
                aria-label="Seek"
                aria-valuetext={clock(now)}
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

              <div
                className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-jam peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
                style={{ left: `${pct(now)}%` }}
                aria-hidden
              />
            </div>

            <span className="mono shrink-0 text-xs tabular-nums text-muted-foreground">
              {dur ? clock(dur) : '—:—'}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <i className="size-2 rounded-full bg-crit" aria-hidden /> {errN} errors
              </span>
              <span className="flex items-center gap-1.5">
                <i className="size-2 rounded-full bg-warn" aria-hidden /> {warnN} warnings
              </span>
            </span>
            {/* The viewport used to sit here as well. It is in Info now, with
                the rest of the machine. */}
          </div>
        </div>
        </div>

        {children}
      </div>

      {/* ── evidence: the logs ────────────────────────────────────────── */}
      {/* Stacked, this has no column to fill, so it takes a definite height of
          its own rather than growing to the length of the log. */}
      {showLog && (
      <div className="flex h-[70svh] min-w-0 flex-col overflow-hidden rounded-lg border bg-card xl:h-full">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2">
          <span className="text-sm font-semibold">DevTools</span>
          <span className="mono text-[11px] text-muted-foreground">
            {errN} errors · {netErrN} failed · {netRows.length} requests
          </span>
        </div>
        <Tabs defaultValue="info" className="flex min-h-0 flex-1 flex-col gap-0">
          <div className="flex items-center gap-2 border-b bg-muted/30 px-2">
            <TabsList variant="line" className="h-9">
              <TabsTrigger value="info" className="text-xs">Info</TabsTrigger>
              <TabsTrigger value="console" className="text-xs">
                Console <span className="text-muted-foreground">{consoleRows.length}</span>
              </TabsTrigger>
              <TabsTrigger value="network" className="text-xs">
                Network <span className="text-muted-foreground">{netRows.length}</span>
                {netErrN > 0 && <i className="size-1.5 rounded-full bg-crit" aria-hidden />}
              </TabsTrigger>
              <TabsTrigger value="steps" className="text-xs">
                Steps <span className="text-muted-foreground">{events.length}</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Everything the header used to say, plus the machine it was
              captured on. One place to look, instead of a strip above the
              player and a tab below it. */}
          <TabsContent value="info" className="flex min-h-0 flex-1 flex-col">
            <ScrollArea className={PANE_H}>
              <dl className="divide-y text-sm">
                <Row icon={Globe} label="Page" value={page} href={httpUrl(page)} />
                <Row icon={Tag} label="Project" value={info.project ?? undefined} />
                <Row icon={Clock} label="Recorded" value={new Date(info.createdAt).toLocaleString()} />
                <Row icon={Timer} label="Length" value={dur ? clock(dur) : undefined} />
                {/* The parsed label is the label; the raw UA stays one hover
                    away, because that is the part you paste into a bug. */}
                <Row icon={AppWindow} label="Browser" value={ua?.browser ?? env.ua} title={env.ua} />
                <Row icon={ua?.apple ? Apple : Monitor} label="OS" value={ua?.os ?? undefined} />
                <Row icon={Cpu} label="GPU" value={env.gpu ?? 'not reported'} />
                <Row
                  icon={Ruler}
                  label="Viewport"
                  value={env.viewport ? `${env.viewport}${env.dpr ? ` · DPR ${env.dpr}` : ''}` : undefined}
                />
                <Row icon={Hammer} label="Build" value={env.build ?? 'no build meta tag'} />
              </dl>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="console" className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b bg-muted/30 px-2.5 py-1.5">
              <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter messages"
                aria-label="Filter console messages"
                className="h-7 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
              />
              <div className="flex shrink-0 gap-1.5">
                {(['error', 'warn', 'log'] as const).map((l) => (
                  <Badge
                    key={l}
                    variant={levels.has(l) ? 'default' : 'ghost'}
                    className="cursor-pointer rounded-md capitalize"
                    render={<button onClick={() => toggleLevel(l)} />}
                  >
                    {l}
                  </Badge>
                ))}
              </div>
            </div>
            <ScrollArea className={PANE_H}>
              {visibleConsole.map((e) => (
                <button
                  key={e.uid}
                  onClick={() => seek(e)}
                  className="flex w-full items-start gap-3 border-b px-3 py-2 text-left text-xs hover:bg-accent/50"
                >
                  <span className="mono shrink-0 tabular-nums">{stamp(off(e))}</span>
                  {e.kind === 'event' ? (
                    <span className="text-chart-2">{e.msg}</span>
                  ) : (
                    <span className={cn('min-w-0 flex-1', LEVEL_STYLE[e.lvl])}>
                      <span className="mono whitespace-pre-wrap wrap-break-word">{e.msg}</span>
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
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Nothing at these levels.
                </p>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="network" className="flex min-h-0 flex-1 flex-col">
            <NetworkPane rows={visibleNet} frames={wsFrames} off={off} onSeek={seek} />
          </TabsContent>

          <TabsContent value="steps" className="flex min-h-0 flex-1 flex-col">
            <ScrollArea className={PANE_H}>
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
            </ScrollArea>
          </TabsContent>

        </Tabs>
      </div>
      )}
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  href,
  title,
}: {
  icon?: React.ElementType;
  label: string;
  value?: string;
  /** Already through httpUrl() — never a raw captured string. */
  href?: string | null;
  title?: string;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <dt className="flex w-28 shrink-0 items-center gap-2 text-muted-foreground">
        {Icon && <Icon className="size-3.5" aria-hidden />}
        {label}
      </dt>
      <dd className="mono min-w-0 flex-1 break-all text-xs" title={title}>
        {value || '—'}
        {href && value ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="ml-2 inline-flex items-center gap-1 whitespace-nowrap text-grape hover:underline"
          >
            open <ExternalLink className="size-3" />
          </a>
        ) : null}
      </dd>
      <Separator className="sr-only" />
    </div>
  );
}
