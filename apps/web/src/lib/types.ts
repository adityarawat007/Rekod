// The capture contract, mirrored by hand from apps/extension/capture.js.
// Change one side and you must change the other.

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
  // A WebSocket, or an RTCDataChannel logged as one (`method: 'RTC'`).
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

/** `by` is the author's email, visible to anyone holding a share link. */
export type Comment = {
  id: string;
  body: string;
  /** ISO 8601, set by the server that stored it. */
  at: string;
  by: string | null;
};

// Generic so `entries.filter(isNet)` on TimelineEntry[] keeps `uid`.
export const isNet = <T extends Entry>(e: T): e is T & NetEntry => e.kind === 'net';
export const isConsole = <T extends Entry>(e: T): e is T & ConsoleEntry => e.kind === 'console';

/** status 0 is a failure on an active row, but on a `passive` resource-timing
 *  row it only means a cross-origin response hid its status. */
export const netFailed = (e: NetEntry) =>
  e.status >= 400 || (e.status === 0 && !e.passive);

export const isError = (e: Entry) =>
  isNet(e) ? netFailed(e) : isConsole(e) && e.lvl === 'error';

export const isWarn = (e: Entry) => isConsole(e) && e.lvl === 'warn';

/** `uid` is assigned here, not captured: `seq` restarts on every navigation,
 *  so it repeats within a report and cannot be a key. */
export type TimelineEntry = Entry & { uid: number };

/** logs and network are separate files; the timeline is their merge. */
export function timeline(r: { logs: Entry[] | null; network: NetEntry[] | null }): TimelineEntry[] {
  const net = (r.network ?? []).map((e) => ({ ...e, kind: 'net' as const }));
  return [...(r.logs ?? []), ...net]
    .sort((a, b) => a.t - b.t || a.seq - b.seq)
    .map((e, uid) => ({ ...e, uid }));
}
