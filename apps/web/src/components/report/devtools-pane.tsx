'use client';

import { useMemo, useState } from 'react';
import { ArrowUpRight, MousePointerClick, PanelRightClose } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { NetworkPane } from '@/components/report/network-pane';
import { PaneToolbar } from '@/components/report/pane-toolbar';
import { clock, httpUrl, stamp, uaSummary } from '@/lib/format';
import {
  isConsole, isError, isNet, isWarn, netFailed, type Entry, type Env, type TimelineEntry,
} from '@/lib/types';
import { cn } from '@/lib/utils';

export type ReportInfo = { project: string | null; pageUrl: string | null; createdAt: string };

export function DevtoolsPane({
  entries,
  env,
  info,
  dur,
  offsetOf,
  onSeek,
  onClose,
}: {
  entries: TimelineEntry[];
  env: Env;
  info: ReportInfo;
  /** The recording's length, once the player knows it. */
  dur: number;
  offsetOf: (e: Entry) => number;
  onSeek: (e: Entry) => void;
  onClose: () => void;
}) {
  const { consoleRows, netRows, wsFrames, events } = useMemo(() => {
    const nets = entries.filter(isNet);
    // Frames hang off their connection row; as rows they would bury the log.
    const frames = new Map<number, typeof nets>();
    for (const e of nets) {
      if (e.rtype !== 'ws' || e.ev === 'open' || e.ws == null) continue;
      const a = frames.get(e.ws);
      if (a) a.push(e);
      else frames.set(e.ws, [e]);
    }
    return {
      consoleRows: entries.filter((e) => isConsole(e) || e.kind === 'event'),
      // A socket that never connected has no 'open'; its 'error' is the row.
      netRows: nets.filter((e) => e.rtype !== 'ws' || e.ev === 'open' || e.ev === 'error'),
      wsFrames: frames,
      events: entries.filter((e) => e.kind === 'event'),
    };
  }, [entries]);

  // ponytail: errors and warnings are one count — warn was never a separate decision.
  const errN = entries.filter((e) => isError(e) || isWarn(e)).length;
  const netErrN = netRows.filter(netFailed).length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <Tabs defaultValue="info" className="flex min-h-0 flex-1 flex-col gap-0">
        {/* §6.15: header tabs, 64px like the bar beside it, 2px --primary under the active one. */}
        <div className="flex h-16 shrink-0 items-stretch gap-3 border-b px-4 narrow:px-6">
          <TabsList
            variant="line"
            aria-label="DevTools"
            className="h-full! min-w-0 flex-1 justify-start gap-6 overflow-x-auto p-0"
          >
            <Tab value="info">Info</Tab>
            <Tab value="console" count={consoleRows.length} alert={errN > 0}>Console</Tab>
            <Tab value="network" count={netRows.length} alert={netErrN > 0}>Network</Tab>
            <Tab value="steps" count={events.length}>Steps</Tab>
          </TabsList>
          {/* Stacked below xl, closing has nothing to give back. */}
          <Button variant="outline" size="icon-lg" className="hidden self-center wide:inline-flex" aria-label="Close DevTools" onClick={onClose}>
            <PanelRightClose />
          </Button>
        </div>

        <TabsContent value="info" className="min-h-0">
          <ScrollArea className="h-full">
            <InfoTab env={env} info={info} dur={dur} />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="console" className="flex min-h-0 flex-col">
          <ConsoleTab rows={consoleRows} offsetOf={offsetOf} onSeek={onSeek} />
        </TabsContent>

        <TabsContent value="network" className="flex min-h-0 flex-col">
          <NetworkPane rows={netRows} frames={wsFrames} off={offsetOf} onSeek={onSeek} />
        </TabsContent>

        <TabsContent value="steps" className="min-h-0">
          <ScrollArea className="h-full">
            {events.length ? (
              <ol>
                {events.map((e) => (
                  <li key={e.uid}>
                    <button
                      onClick={() => onSeek(e)}
                      className="flex w-full items-center gap-3 border-b px-4 py-2.5 text-left transition-colors duration-150 hover:bg-bg narrow:px-6"
                    >
                      <span className="mono w-12 shrink-0 text-xs text-muted-foreground">{stamp(offsetOf(e))}</span>
                      <MousePointerClick className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 truncate">{e.msg}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>No navigation or visibility events captured.</Empty>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Tab({
  value,
  count,
  alert,
  children,
}: {
  value: string;
  count?: number;
  /** A red dot: something in this tab failed. */
  alert?: boolean;
  children: React.ReactNode;
}) {
  return (
    <TabsTrigger value={value} className="h-full flex-none px-0 group-data-horizontal/tabs:after:-bottom-px!">
      {children}
      {count ? <span className="mono text-xs font-normal text-muted-foreground">{count}</span> : null}
      {alert ? (
        <>
          <i className="size-2 rounded-full bg-error" aria-hidden />
          <span className="sr-only">has failures</span>
        </>
      ) : null}
    </TabsTrigger>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-8 text-center text-muted-foreground">{children}</p>;
}

// ── Info ───────────────────────────────────────────────────────────────────

function InfoTab({ env, info, dur }: { env: Env; info: ReportInfo; dur: number }) {
  // Either may be missing on an old report.
  const page = info.pageUrl ?? env.url;
  const href = httpUrl(page);
  const ua = uaSummary(env.ua);

  return (
    <div className="p-4 narrow:p-6">
      {page ? (
        <div className="mb-2 flex items-center gap-4 border border-line-strong px-4 py-3">
          <span className="label w-24 shrink-0 text-muted-foreground">Page</span>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="group flex min-w-0 items-center gap-1 text-link hover:underline"
            >
              <span className="mono truncate text-[13px]">{page}</span>
              <ArrowUpRight className="size-3.5 shrink-0 opacity-60 group-hover:opacity-100" aria-hidden />
            </a>
          ) : (
            <span className="mono truncate text-xs">{page}</span>
          )}
        </div>
      ) : null}
      <dl className="divide-y px-4">
        <Row label="Recorded" value={new Date(info.createdAt).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })} />
        <Row label="Length" value={dur ? clock(dur) : null} />
        <Row label="Project" value={info.project} />
        {/* The raw UA stays on hover: it is what gets pasted into a bug. */}
        <Row label="Browser" value={ua?.browser ?? env.ua} title={env.ua} />
        <Row label="OS" value={ua?.os} />
        <Row label="Window size" value={env.viewport ? `${env.viewport}${env.dpr ? ` · ${env.dpr}×` : ''}` : null} />
        <Row label="GPU" value={env.gpu} />
        <Row label="Build" value={env.build} />
      </dl>
    </div>
  );
}

/** Uncaptured rows are omitted: dashes read as a broken capture. */
function Row({ label, value, title }: { label: string; value?: string | null; title?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-4 py-3">
      <dt className="label w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 wrap-break-word" title={title}>{value}</dd>
    </div>
  );
}

// ── Console ────────────────────────────────────────────────────────────────

type Level = 'all' | 'error' | 'warn' | 'info';
const LEVELS: Record<Level, string> = { all: 'All levels', error: 'Errors', warn: 'Warnings', info: 'Info & logs' };

const TAG = { error: 'Err', warn: 'Warn', info: 'Log', step: 'Step' } as const;
const TAG_CLASS = { error: 'text-error', warn: 'text-warning', info: 'text-muted-foreground', step: 'text-faint' } as const;

const levelOf = (e: Entry): Exclude<Level, 'all'> | null =>
  isError(e) ? 'error' : isWarn(e) ? 'warn' : isConsole(e) ? 'info' : null;

function ConsoleTab({
  rows,
  offsetOf,
  onSeek,
}: {
  rows: TimelineEntry[];
  offsetOf: (e: Entry) => number;
  onSeek: (e: Entry) => void;
}) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<Level>('all');
  const q = query.toLowerCase();
  const visible = rows.filter(
    (e) =>
      (level === 'all' || levelOf(e) === level) &&
      (!q || ('msg' in e && e.msg.toLowerCase().includes(q))),
  );

  return (
    <>
      <PaneToolbar query={query} onQuery={setQuery} placeholder="Filter messages">
        <Select value={level} onValueChange={(v) => setLevel(v as Level)}>
          <SelectTrigger className="border-line-strong bg-panel" aria-label="Log level">
            <SelectValue>{(v: Level) => LEVELS[v]}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            {(Object.keys(LEVELS) as Level[]).map((l) => (
              <SelectItem key={l} value={l}>{LEVELS[l]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PaneToolbar>
      <ScrollArea className="min-h-0 flex-1">
        {visible.map((e) => {
          const lvl = levelOf(e);
          return (
            <button
              key={e.uid}
              onClick={() => onSeek(e)}
              className={cn(
                'flex w-full items-start gap-3 border-b px-4 py-2 text-left transition-colors duration-150 hover:bg-bg narrow:px-6',
                lvl === 'error' && 'bg-error/5',
              )}
            >
              <span className="mono w-12 shrink-0 pt-px text-xs text-muted-foreground">{stamp(offsetOf(e))}</span>
              {/* §2.6: the level is written, never colour alone. */}
              <span className={cn('label w-10 shrink-0 pt-px', TAG_CLASS[lvl ?? 'step'])}>{TAG[lvl ?? 'step']}</span>
              <span className="min-w-0 flex-1">
                <span className={cn('mono block whitespace-pre-wrap wrap-break-word text-[13px]', lvl === 'error' ? 'text-error' : 'text-ink')}>
                  {'msg' in e ? e.msg : null}
                </span>
                {isConsole(e) && e.stack ? (
                  <span className="mono mt-1 block whitespace-pre-wrap text-[11px] text-muted-foreground">{e.stack}</span>
                ) : null}
              </span>
            </button>
          );
        })}
        {!visible.length && <Empty>No messages match.</Empty>}
      </ScrollArea>
    </>
  );
}
