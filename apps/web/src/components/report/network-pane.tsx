'use client';

import { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, Crosshair, PanelBottom, PanelRight, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { JsonView } from '@/components/report/json-view';
import { PaneToolbar } from '@/components/report/pane-toolbar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ms, stamp, toCurl, urlParts } from '@/lib/format';
import { netFailed, type Entry, type NetEntry, type TimelineEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

type Net = TimelineEntry & NetEntry;

/** Which edge the request detail is pinned to. Remembered per browser. */
type Dock = 'right' | 'bottom';
const DOCK_KEY = 'rekod.net.dock';

const RTYPE_LABEL: Record<string, string> = {
  fetch: 'Fetch/XHR',
  ws: 'WS',
  js: 'JS',
  css: 'CSS',
  font: 'Font',
  img: 'Img',
  media: 'Media',
  doc: 'Doc',
  other: 'Other',
};

/** One grid for the heads and the rows. Docked right, `data-wide` columns hide. */
const COLS = 'grid items-center gap-3 px-4 narrow:px-6';
const cols = (narrow: boolean) =>
  cn(COLS, narrow ? 'grid-cols-[2.75rem_minmax(0,1fr)] [&>[data-wide]]:hidden' : 'grid-cols-[2.75rem_minmax(0,1fr)_3.5rem_3rem_4.5rem_3.5rem]');

/** §2.6: 2xx --success, 4xx/5xx/failed --error, always with the code written. */
function statusClass(status: number) {
  if (status === 0 || status >= 400) return 'font-medium text-error';
  if (status >= 300) return 'text-muted-foreground';
  return 'text-success';
}

/** The request table, with the selected request in a resizable panel laid
 *  over it (not inline, which pushed every row below it down), like DevTools. */
export function NetworkPane({
  rows,
  frames,
  off,
  onSeek,
}: {
  rows: Net[];
  /** ws connection id → its frames. */
  frames: Map<number, Net[]>;
  off: (e: Entry) => number;
  onSeek: (e: Entry) => void;
}) {
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [errorsOnly, setErrorsOnly] = useState(false);
  // By uid: seq collides across navigations.
  const [sel, setSel] = useState<number | null>(null);
  // A fraction, not pixels: the pane is the viewport on xl and a fixed slab
  // below it. The dock side is remembered; blocked storage means 'right'.
  const [dock, setDock] = useState<Dock>(() => {
    try {
      return localStorage.getItem(DOCK_KEY) === 'bottom' ? 'bottom' : 'right';
    } catch {
      return 'right';
    }
  });
  const [split, setSplit] = useState(0.5);
  const wrap = useRef<HTMLDivElement>(null);
  const right = dock === 'right';

  const moveDock = (d: Dock) => {
    setDock(d);
    try {
      localStorage.setItem(DOCK_KEY, d);
    } catch {}
  };

  const clamp = (v: number) => Math.min(0.9, Math.max(0.15, v));
  // Measured from the docked edge.
  const drag = (e: React.PointerEvent) => {
    e.preventDefault();
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    const move = (ev: PointerEvent) =>
      setSplit(clamp(right ? (box.right - ev.clientX) / box.width : (box.bottom - ev.clientY) / box.height));
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };

  const nudge = (e: React.KeyboardEvent) => {
    const grow = right ? 'ArrowLeft' : 'ArrowUp';
    const shrink = right ? 'ArrowRight' : 'ArrowDown';
    if (e.key === grow) setSplit((v) => clamp(v + 0.05));
    if (e.key === shrink) setSplit((v) => clamp(v - 0.05));
  };

  const types = useMemo(() => ['all', ...new Set(rows.map((e) => e.rtype))], [rows]);

  const visible = rows.filter((e) => {
    if (type !== 'all' && e.rtype !== type) return false;
    if (errorsOnly && !netFailed(e)) return false;
    if (query && !e.url.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const active = visible.find((e) => e.uid === sel) ?? null;
  const narrow = !!active && right;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneToolbar query={query} onQuery={setQuery} placeholder="Filter by URL">
        <label className="flex h-8 shrink-0 cursor-pointer items-center gap-2 text-muted-foreground">
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(e) => setErrorsOnly(e.target.checked)}
            className="peer sr-only"
          />
          {/* §6.11: 17px, square. */}
          <span
            aria-hidden
            className={cn(
              'grid size-[17px] place-items-center border-[1.5px] border-line-strong bg-panel peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
              errorsOnly && 'border-ink bg-ink text-panel',
            )}
          >
            {errorsOnly ? <Check className="size-3 [stroke-width:3]" /> : null}
          </span>
          Errors only
        </label>
      </PaneToolbar>

      <ToggleGroup
        value={[type]}
        // One type at a time; clicking the pressed chip keeps it pressed.
        onValueChange={(v) => v[0] && setType(v[0])}
        size="sm"
        spacing={1.5}
        aria-label="Request type"
        className="w-full shrink-0 flex-wrap border-b px-4 py-2.5 narrow:px-6"
      >
        {types.map((t) => (
          <ToggleGroupItem
            key={t}
            value={t}
            // §6.3 chips: pressed is the active state.
            className="h-[38px] border border-line-strong bg-bg px-3 text-[13px] text-muted-foreground hover:bg-tint-soft aria-pressed:border-ink aria-pressed:bg-panel aria-pressed:font-medium aria-pressed:text-ink"
          >
            {t === 'all' ? 'All' : (RTYPE_LABEL[t] ?? t)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className={cn(cols(narrow), 'label shrink-0 border-b py-2 text-muted-foreground')}>
        <span>At</span>
        <span>Name</span>
        <span data-wide>Method</span>
        <span data-wide>Status</span>
        <span data-wide>Type</span>
        <span data-wide className="text-right">Time</span>
      </div>

      <div ref={wrap} className="relative flex min-h-0 flex-1">
        <ScrollArea className="h-full min-w-0 flex-1">
          {visible.map((e) => {
            const { name, host } = urlParts(e.url);
            return (
              <button
                key={e.uid}
                onClick={() => setSel(e.uid)}
                className={cn(
                  cols(narrow),
                  'w-full border-b py-2 text-left text-[13px] transition-colors duration-150 hover:bg-bg',
                  netFailed(e) && 'bg-error/5',
                  // §6.8 selected row: --bg and a 3px --ink bar on the left.
                  sel === e.uid && 'bg-bg shadow-[inset_3px_0_0_var(--ink)]',
                )}
                title={e.url}
              >
                <span className="mono text-xs text-muted-foreground">{stamp(off(e))}</span>
                <span className={cn('mono min-w-0 truncate text-xs', netFailed(e) ? 'text-error' : 'text-ink')}>
                  {name}
                  <span className="ml-1.5 text-muted-foreground">{host}</span>
                </span>
                <span data-wide className="mono text-xs">{e.method ?? '—'}</span>
                <span data-wide className={cn('mono text-xs', statusClass(e.status))}>{e.status || 'failed'}</span>
                <span data-wide className="truncate text-xs text-muted-foreground">{RTYPE_LABEL[e.rtype] ?? e.rtype}</span>
                <span data-wide className="mono text-right text-xs text-muted-foreground">{ms(e.ms)}</span>
              </button>
            );
          })}
          {!visible.length && (
            <p className="p-8 text-center text-muted-foreground">No requests match this filter.</p>
          )}
        </ScrollArea>

        {active && (
          <div
            className={cn(
              'absolute z-10 flex bg-panel',
              right ? 'inset-y-0 right-0 flex-row border-l' : 'inset-x-0 bottom-0 flex-col border-t',
            )}
            style={right ? { width: `${split * 100}%` } : { height: `${split * 100}%` }}
          >
            {/* First child, so it sits on the panel's inner edge. */}
            <div
              role="separator"
              aria-orientation={right ? 'vertical' : 'horizontal'}
              aria-label="Resize request detail"
              tabIndex={0}
              onPointerDown={drag}
              onKeyDown={nudge}
              className={cn(
                'group flex shrink-0 items-center justify-center bg-bg transition-colors duration-150 hover:bg-cell focus-visible:bg-cell',
                right ? 'h-full w-2 cursor-col-resize' : 'h-2 w-full cursor-row-resize',
              )}
            >
              <span
                className={cn(
                  'bg-line-strong group-hover:bg-ink',
                  right ? 'h-8 w-0.5' : 'h-0.5 w-8',
                )}
                aria-hidden
              />
            </div>
            <Detail
              e={active}
              frames={frames.get(active.ws ?? -1)}
              off={off}
              onSeek={onSeek}
              onClose={() => setSel(null)}
              dock={dock}
              onDock={moveDock}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Detail({
  e,
  frames,
  off,
  onSeek,
  onClose,
  dock,
  onDock,
}: {
  e: Net;
  frames?: Net[];
  off: (e: Entry) => number;
  onSeek: (e: Entry) => void;
  onClose: () => void;
  dock: Dock;
  onDock: (d: Dock) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(toCurl(e));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Tabs defaultValue="headers" className="flex min-h-0 min-w-0 flex-1 flex-col gap-0">
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        <Button size="icon-xs" variant="ghost" onClick={onClose} aria-label="Close request detail">
          <X />
        </Button>
        <TabsList variant="line" className="h-8! gap-4 px-1">
          <TabsTrigger value="headers" className="text-[13px] group-data-horizontal/tabs:after:bottom-[-7px]">
            Headers
          </TabsTrigger>
          <TabsTrigger value="request" className="text-[13px] group-data-horizontal/tabs:after:bottom-[-7px]">
            Request
          </TabsTrigger>
          <TabsTrigger value="response" className="text-[13px] group-data-horizontal/tabs:after:bottom-[-7px]">
            Response
          </TabsTrigger>
        </TabsList>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => onSeek(e)}
            title="Jump the player to this request"
            className="mono"
          >
            <Crosshair /> {stamp(off(e))}
          </Button>
          {e.rtype !== 'ws' && (
            <Button size="xs" variant="outline" onClick={copy}>
              {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy cURL'}
            </Button>
          )}
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={dock === 'right' ? 'Dock to the bottom' : 'Dock to the right'}
            title={dock === 'right' ? 'Dock to the bottom' : 'Dock to the right'}
            onClick={() => onDock(dock === 'right' ? 'bottom' : 'right')}
          >
            {dock === 'right' ? <PanelBottom /> : <PanelRight />}
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <TabsContent value="headers">
          <Section title="General">
            <KV k="Request URL" v={e.url} />
            <KV k="Request method" v={e.method ?? RTYPE_LABEL[e.rtype]} />
            <KV
              k="Status code"
              v={
                <span className={statusClass(e.status)}>
                  {e.status || `failed${e.error ? ` — ${e.error}` : ''}`}
                </span>
              }
            />
            <KV k="Duration" v={ms(e.ms) || '—'} />
            {e.size != null && <KV k="Size" v={`${e.size} B`} />}
          </Section>
          {e.rtype === 'ws' ? (
            <Section title={`Frames (${frames?.filter((f) => f.ev === 'frame').length ?? 0})`}>
              <WsFrames frames={frames} off={off} />
            </Section>
          ) : (
            <>
              <Headers title="Response headers" h={e.resHeaders} />
              <Headers title="Request headers" h={e.reqHeaders} />
            </>
          )}
        </TabsContent>

        <TabsContent value="request" className="p-3">
          <JsonView text={e.reqBody} />
        </TabsContent>

        <TabsContent value="response" className="p-3">
          <JsonView text={e.body} />
        </TabsContent>
      </ScrollArea>
    </Tabs>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="group border-b last:border-b-0">
      <summary className="label flex cursor-pointer list-none items-center justify-between bg-bg px-3 py-2 text-ink">
        {title}
        <ChevronDown className="size-3.5 text-muted-foreground group-open:rotate-180" />
      </summary>
      <div className="divide-y">{children}</div>
    </details>
  );
}

function Headers({ title, h }: { title: string; h?: Record<string, string> | null }) {
  const rows = Object.entries(h ?? {});
  return (
    <Section title={title}>
      {rows.length ? (
        rows.map(([k, v]) => <KV key={k} k={k} v={v} />)
      ) : (
        <p className="px-3 py-2 text-[13px] text-muted-foreground">Not captured.</p>
      )}
    </Section>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-3 px-3 py-2">
      {/* §6.15: keys in mono `label`, values in mono `data`. */}
      <span className="label wrap-break-word text-muted-foreground">{k}</span>
      <span className="mono wrap-anywhere text-xs">{v}</span>
    </div>
  );
}

/** ↑ sent, ↓ received. capture.js describes binary frames rather than encoding them. */
function WsFrames({ frames, off }: { frames?: Net[]; off: (e: Entry) => number }) {
  if (!frames?.length) {
    return (
      <p className="px-3 py-2 text-[13px] text-muted-foreground">No frames after the handshake.</p>
    );
  }
  return (
    <ul className="divide-y">
      {frames.map((f) => (
        <li key={f.uid} className="flex gap-2 px-3 py-1.5 text-xs">
          <span className="mono shrink-0 text-muted-foreground">{stamp(off(f))}</span>
          <span
            className={cn(
              'mono w-3 shrink-0',
              f.ev === 'error'
                ? 'text-error'
                : f.dir === 'out'
                  ? 'text-success'
                  : 'text-muted-foreground',
            )}
          >
            {f.ev === 'frame' ? (f.dir === 'out' ? '↑' : '↓') : f.ev === 'close' ? '×' : '!'}
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
  );
}
