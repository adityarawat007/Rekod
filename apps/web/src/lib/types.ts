// The capture contract. Written by the extension (capture.js → offscreen.js),
// read here. Change one side and you change both — that is why the dashboard
// lives in the extension's repo.

export type ConsoleEntry = {
  kind: 'console';
  lvl: 'log' | 'info' | 'warn' | 'error' | 'debug';
  msg: string;
  stack?: string | null;
  t: number;
  seq: number;
};

export type EventEntry = {
  kind: 'event';
  ev: 'nav' | 'vis' | string;
  msg: string;
  t: number;
  seq: number;
};

export type NetEntry = {
  kind: 'net';
  method?: string;
  url: string;
  status: number;
  ms?: number;
  rtype: 'fetch' | 'ws' | 'js' | 'css' | 'font' | 'img' | 'media' | 'doc' | 'other';
  reqHeaders?: Record<string, string> | null;
  reqBody?: string | null;
  resHeaders?: Record<string, string> | null;
  body?: string | null;
  passive?: boolean;
  size?: number;
  error?: string;
  // Framed streams only — a WebSocket, or an RTCDataChannel, which the
  // extension logs as one (`method: 'RTC'`, url `rtc:peer-N #label`). They are
  // the same shape in a report: open, frames with a direction, close.
  ws?: number;
  ev?: 'open' | 'frame' | 'close' | 'error';
  dir?: 'in' | 'out';
  data?: string;
  code?: number;
  reason?: string;
  protocols?: string | string[] | null;
  t: number;
  seq: number;
};

export type Entry = ConsoleEntry | EventEntry | NetEntry;

export type Env = {
  ua?: string;
  url?: string;
  host?: string;
  viewport?: string;
  dpr?: number;
  gpu?: string | null;
  build?: string | null;
};

/** One entry in a report's thread, as lib/server/reports.ts hands it out.
 *  Written by the dashboard only: the extension's second input is the
 *  `description`, not the first comment. `by` is the author's email — it is
 *  visible to anyone holding a share link. */
export type Comment = {
  id: string;
  body: string;
  /** ISO 8601, set by the server that stored it. */
  at: string;
  by: string | null;
};

// Generic in the input so narrowing survives whatever the caller is holding:
// `entries.filter(isNet)` on a TimelineEntry[] must come back with `uid` still
// attached, and a guard fixed to `e is NetEntry` silently drops it — TS falls
// back to the non-narrowing filter overload and every field access then fails.
export const isNet = <T extends Entry>(e: T): e is T & NetEntry => e.kind === 'net';
export const isConsole = <T extends Entry>(e: T): e is T & ConsoleEntry => e.kind === 'console';

/** A failed request. status 0 is ambiguous: on an active row (a fetch that
 *  threw, a websocket error) it means failure; on a `passive` resource-timing
 *  row it only means the cross-origin response never exposed a status. Treating
 *  those as failures counts every cached stylesheet as a bug. */
export const netFailed = (e: NetEntry) =>
  e.status >= 400 || (e.status === 0 && !e.passive);

export const isError = (e: Entry) =>
  isNet(e) ? netFailed(e) : isConsole(e) && e.lvl === 'error';

export const isWarn = (e: Entry) => isConsole(e) && e.lvl === 'warn';

/** A merged-timeline entry. `uid` is assigned here and is NOT part of the
 *  capture contract, because `seq` cannot be used as an identity: it counts up
 *  inside one `capture.js` instance, which means one page load, and restarts at
 *  1 on every navigation — while the offscreen buffer deliberately spans
 *  navigations. Any report that crosses a navigation therefore contains
 *  repeated `seq` values. Fine as a sort tiebreaker, useless as a React key or
 *  a selected-row marker. */
export type TimelineEntry = Entry & { uid: number };

/** logs and network are separate files; the timeline is their merge. */
export function timeline(r: { logs: Entry[] | null; network: NetEntry[] | null }): TimelineEntry[] {
  const net = (r.network ?? []).map((e) => ({ ...e, kind: 'net' as const }));
  return [...(r.logs ?? []), ...net]
    .sort((a, b) => a.t - b.t || a.seq - b.seq)
    .map((e, uid) => ({ ...e, uid }));
}
