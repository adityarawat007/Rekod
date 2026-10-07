import 'server-only';
import { z } from 'zod';
import { shareToken, uuidv7 } from '../db/ids.ts';
import { blob } from '../storage/index.ts';
import { LIMITS, PLANS, type Plan } from '../plans.ts';
import { store } from './store/index.ts';
import type { BaseRow, CompleteSet, Kind } from './store/types.ts';

/**
 * The scoped reports repo. EVERY function takes the workspace first and puts
 * it in the WHERE clause — that argument is the tenant boundary, there is no
 * RLS behind it. test-tenancy.ts checks each one against a second workspace.
 *
 * The one unscoped read is sharedReport(), where the token is the credential.
 * The one unscoped write is purgeAbandoned(), a system job with no caller.
 * usageOf() and setPlan() are keyed by user, not workspace: a plan is a person's.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A malformed id is "not found", not a 22P02 from Postgres. */
const isId = (id: string) => typeof id === 'string' && UUID.test(id);

const keyFor = (ws: string, id: string, kind: Kind) =>
  `${ws}/${id}/${kind}.${kind === 'video' ? 'webm' : kind === 'screenshot' ? 'png' : kind === 'poster' ? 'webp' : 'json'}`;

// ── list ────────────────────────────────────────────────────────────────────

export const REPORT_TYPES = ['video', 'screenshot'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export type ListFilters = {
  q?: string;
  types?: ReportType[];
  /** Exact site (reports.project). */
  project?: string;
  /** The last id of the previous page. */
  after?: string;
};

/** 16: the dashboard's first screen is a full 4×4 grid. */
export const PAGE_SIZE = 16;

export type ListRow = {
  id: string;
  title: string;
  project: string | null;
  createdAt: Date;
  type: 'video' | 'screenshot';
  durationMs: number | null;
  /** Signed thumbnail source, or null when the report has no media. */
  preview: string | null;
  /** Signed poster image (videos recorded by newer extensions), else null. */
  poster: string | null;
};

/** One page, newest first. Keyset on the id: ids are UUIDv7 minted at create,
 *  so id order IS creation order, and the cursor needs no timestamp — which
 *  would lose Postgres's microseconds in a JS Date and skip rows. */
export async function listReports(
  ws: string,
  f: ListFilters = {},
): Promise<{ rows: ListRow[]; next: string | null }> {
  const rows = await store().listReports(ws, {
    q: f.q?.trim(), types: f.types, project: f.project || undefined, after: f.after && isId(f.after) ? f.after : undefined,
    // One extra row says whether there is a next page, without a count(*).
    limit: PAGE_SIZE + 1,
  });

  const page = rows.slice(0, PAGE_SIZE);
  return {
    // Signing is a local HMAC, not a round trip, so one per row costs nothing.
    rows: await Promise.all(page.map(async ({ key, posterKey, ...r }) => ({
      ...r,
      preview: key ? await blob().presignDownload(key, 3600) : null,
      poster: posterKey ? await blob().presignDownload(posterKey, 3600) : null,
    }))),
    next: rows.length > PAGE_SIZE ? page.at(-1)!.id : null,
  };
}

/** The sites this workspace has recorded, for the filter: most used first. */
export const projectsOf = (ws: string) => store().projectsOf(ws);

// ── one report ──────────────────────────────────────────────────────────────

export type CommentView = { id: string; body: string; at: string; by: string | null };

async function commentsOf(ws: string, reportId: string): Promise<CommentView[]> {
  const rows = await store().commentsOf(ws, reportId);
  return rows.map((c) => ({ ...c, at: c.at.toISOString() }));
}

/** Everything the player needs: signed media, the two log files, the thread. */
async function hydrate(ws: string, row: BaseRow, assets: { kind: Kind; key: string }[], withLogs = true) {
  const key = (k: Kind) => assets.find((a) => a.kind === k)?.key;
  const mediaKey = key('video') ?? key('screenshot');
  const logsKey = withLogs ? key('logs') : undefined;
  const netKey = withLogs ? key('network') : undefined;
  const posterKey = key('poster');
  const [logs, network, comments, mediaUrl, posterUrl] = await Promise.all([
    logsKey ? blob().readJson<unknown[]>(logsKey) : [],
    netKey ? blob().readJson<unknown[]>(netKey) : [],
    commentsOf(ws, row.id),
    // An hour: a viewer who seeks after that re-opens the page.
    mediaKey ? blob().presignDownload(mediaKey, 3600) : null,
    posterKey ? blob().presignDownload(posterKey, 3600) : null,
  ]);
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    media: mediaUrl ? { url: mediaUrl, kind: row.type === 'screenshot' ? 'shot' as const : 'video' as const, poster: posterUrl ?? undefined } : null,
    logs, network, comments,
  };
}

export async function getReport(ws: string, id: string) {
  if (!isId(id)) return null;
  // The creator, owner side only: sharedReport() never names anyone.
  const row = await store().getReport(ws, id);
  if (!row) return null;
  const { shareToken: token, creator, assets, ...base } = row;
  return { ...(await hydrate(ws, base, assets)), shareToken: token, creator };
}

/** The whole anonymous surface. Explicit columns — no workspace, no creator,
 *  no token — and a processing report is not shareable yet. */
/** A v4 UUID, or the 64-hex tokens minted before 1 Oct 2026. */
const SHARE_TOKEN = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9a-f]{64})$/;

export async function sharedReport(token: string, withLogs = true) {
  // typeof: RegExp.test() coerces, and ['<a real token>'] would pass it.
  if (typeof token !== 'string' || !SHARE_TOKEN.test(token)) return null;
  const row = await store().sharedReport(token);
  if (!row) return null;
  // The row's own workspace scopes its comments; it goes no further.
  const { assets, workspaceId, ...base } = row;
  return hydrate(workspaceId, base, assets, withLogs);
}

// ── writes ──────────────────────────────────────────────────────────────────

const text = (max: number) => z.string().max(max);

export const CreateInput = z.object({
  title: text(500).default(''),
  description: text(20_000).nullish(),
  pageUrl: text(4096).nullish(),
  project: text(255).nullish(),
  t0: z.number().int().positive(),
  durationMs: z.number().int().nonnegative().nullish(),
  env: z.record(z.string(), z.unknown()).default({})
    .refine((e) => JSON.stringify(e).length < 16_384, 'env is too large'),
  /** The media's MIME type, or null when the capture produced none. */
  media: z.string().regex(/^(video\/webm|image\/png)(;.*)?$/).nullable(),
  /** Exact byte sizes. Each is signed into its upload URL, so the bucket
   *  refuses a body of any other length — that is the size cap. */
  sizes: z.object({
    media: z.number().int().positive().optional(),
    /** A still of the first frame, videos only; absent from older extensions. */
    poster: z.number().int().positive().optional(),
    logs: z.number().int().nonnegative(),
    network: z.number().int().nonnegative(),
  }),
});

// ── plans ───────────────────────────────────────────────────────────────────

/** A user's standing, in one query. Only `ready` videos count against the
 *  limit: a discarded or abandoned upload never shows up, so it must not use
 *  a slot. Deleting a video frees one. Screenshots are not counted.
 *  `lastHour` counts every create, finished or not — that is the rate limit. */
export const usageOf = (userId: string) => store().usageOf(userId);

/** Moves a user to a plan, taking its video limit unless given one. The only
 *  way a plan changes today (`pnpm set-plan`); billing will call it too. */
export async function setPlan(email: string, plan: Plan, videos: number = PLANS[plan].videos) {
  return store().setPlan(email.toLowerCase(), plan, videos);
}

export type Refusal = { refused: 'videos' | 'rate' | 'size'; message: string };

const mb = (n: number) => `${Math.round(n / 2 ** 20)} MB`;

/** Creates the row in `processing` and hands back one presigned PUT per file.
 *  The bytes go extension → bucket; this server never sees them.
 *
 *  Two plain inserts, not a transaction: each round trip to the database is
 *  ~150ms from here and a transaction is four of them. If the second insert
 *  fails, what is left is a `processing` row nobody lists — harmless. The id
 *  is minted here so both inserts can name it. */
export async function createReport(
  ws: string, userId: string, input: z.infer<typeof CreateInput>,
): Promise<Refusal | { id: string; uploads: Partial<Record<'media' | 'poster' | 'logs' | 'network', string>> }> {
  const type = input.media?.startsWith('image/') ? 'screenshot' as const : 'video' as const;
  const files: { kind: Kind; mime: string; bytes: number }[] = [
    ...(input.media ? [{ kind: type, mime: input.media.split(';')[0], bytes: input.sizes.media ?? 0 }] : []),
    // Best-effort, like its PUT: an oversize poster is left out, never a refusal.
    ...(type === 'video' && input.sizes.poster && input.sizes.poster <= LIMITS.bytes.poster
      ? [{ kind: 'poster' as const, mime: 'image/webp', bytes: input.sizes.poster }] : []),
    { kind: 'logs', mime: 'application/json', bytes: input.sizes.logs },
    { kind: 'network', mime: 'application/json', bytes: input.sizes.network },
  ];
  for (const f of files) {
    const max = LIMITS.bytes[f.kind];
    if (f.bytes > max || (f.kind === type && !f.bytes)) {
      return { refused: 'size', message: `This ${f.kind === type ? 'recording' : f.kind + ' file'} is over ${mb(max)}.` };
    }
  }

  // Checked here so the extension hears "full" before it uploads anything.
  // completeReport() enforces the video limit again, since two creates can
  // both pass this. One query, ~150ms, while the composer is open anyway.
  const u = await usageOf(userId);
  if (!u) return { refused: 'videos', message: 'No such user.' };
  if (u.lastHour >= LIMITS.createsPerHour) {
    return { refused: 'rate', message: 'Too many Rekods in the last hour. Try again in a bit.' };
  }
  if (type === 'video' && u.videos >= u.limit) {
    return { refused: 'videos', message: `You have used all ${u.limit} Rekods on your plan. Delete one to record another.` };
  }

  const id = uuidv7();

  await store().insertReport({
    id, workspaceId: ws, createdBy: userId, type,
    title: input.title, description: input.description || null,
    pageUrl: input.pageUrl ?? null, project: input.project ?? null,
    t0: input.t0, durationMs: input.durationMs ?? null, env: input.env,
  }, files.map((f) => ({ kind: f.kind, mimeType: f.mime, storageKey: keyFor(ws, id, f.kind) })));

  const uploads: Partial<Record<'media' | 'poster' | 'logs' | 'network', string>> = {};
  for (const f of files) {
    uploads[f.kind === 'logs' || f.kind === 'network' || f.kind === 'poster' ? f.kind : 'media'] = await blob().presignUpload(keyFor(ws, id, f.kind), f.bytes);
  }
  return { id, uploads };
}

/** What the composer knows only once you press Send. The extension uploads
 *  while you are still typing (see apps/extension/offscreen.js), so these
 *  arrive with /complete rather than with /reports. All optional. */
export const CompleteInput = z.object({
  title: text(500).optional(),
  description: text(20_000).nullish(),
  pageUrl: text(4096).nullish(),
  project: text(255).nullish(),
  env: z.record(z.string(), z.unknown()).optional()
    .refine((e) => !e || JSON.stringify(e).length < 16_384, 'env is too large'),
});

/** Names the report and flips it to `ready`, in one UPDATE.
 *
 *  ponytail: it does not HEAD the files first. The extension calls this only
 *  after every PUT answered 200, and checking three objects cost ~1s against
 *  the bucket — for a failure that could only come from a client lying about
 *  its own upload, whose only victim is that client's own unplayable report.
 *  Sizes are not recorded either; nothing reads them until billing (ROADMAP
 *  Phase 5), and that job can HEAD the objects in bulk. */
export async function completeReport(ws: string, id: string, f: z.infer<typeof CompleteInput> = {}) {
  if (!isId(id)) return false;
  const set: CompleteSet = {};
  if (f.title !== undefined) set.title = f.title;
  if (f.description !== undefined) set.description = f.description || null;
  if (f.pageUrl !== undefined) set.pageUrl = f.pageUrl;
  if (f.project !== undefined) set.project = f.project;
  if (f.env !== undefined) set.env = f.env;
  // The video limit is enforced in the same UPDATE, inside the adapter: a
  // video becomes ready only while its creator has fewer ready ones than their
  // video_limit, and an already-ready row passes (idempotent retry).
  return store().completeReport(ws, id, set);
}

export async function updateReport(ws: string, id: string, fields: { title?: string; description?: string | null }) {
  if (!isId(id)) return false;
  return store().updateReport(ws, id, fields);
}

/**
 * Objects first, then rows. Both orders can orphan a file if the second half
 * fails; this one never leaves a report you can open and cannot watch.
 * Removal is best-effort per object — a file already gone must not stop the row.
 */
export async function deleteReports(ws: string, ids: string[]) {
  const valid = ids.filter(isId);
  if (!valid.length) return 0;
  const keys = await store().assetKeys(ws, valid);
  await Promise.allSettled(keys.map((k) => blob().removeObject(k)));
  return store().deleteReports(ws, valid);
}

/** Deletes `processing` reports older than LIMITS.abandonedAfterMs, files
 *  first, across every workspace — the one unscoped write, run by the cleanup
 *  job and nothing else. An upload that never reached Send (a closed tab, a
 *  crash, a client that only ever creates) would otherwise hold its files
 *  forever. Batched so one run stays inside a function's time limit. */
export async function purgeAbandoned(batch = 200) {
  const rows = await store().abandoned(new Date(Date.now() - LIMITS.abandonedAfterMs), batch);
  const byWs = Map.groupBy(rows, (r) => r.ws);
  let n = 0;
  for (const [ws, rs] of byWs) n += await deleteReports(ws, rs.map((r) => r.id));
  // Adapters with a per-user video counter (MongoDB) repair its drift here.
  await store().recountVideos();
  return n;
}

// ── comments ────────────────────────────────────────────────────────────────

export async function addComment(ws: string, userId: string, reportId: string, body: string): Promise<CommentView | null> {
  if (!isId(reportId)) return null;
  const c = await store().addComment(ws, userId, reportId, body);
  return c && { ...c, at: c.at.toISOString() };
}

/** Soft delete, and only your own comment. */
export async function deleteComment(ws: string, userId: string, commentId: string) {
  if (!isId(commentId)) return false;
  return store().deleteComment(ws, userId, commentId);
}

// ── share ───────────────────────────────────────────────────────────────────

/** The report's link token, minting one if it was revoked. Copyable any time. */
export async function shareTokenFor(ws: string, id: string) {
  if (!isId(id)) return null;
  const current = await store().getShareToken(ws, id);
  if (current === undefined) return null;
  if (current) return current;
  const token = shareToken();
  await store().setShareToken(ws, id, token);
  return token;
}

/** Kills the current link. The next copy mints a new one. */
export async function revokeShare(ws: string, id: string) {
  if (!isId(id)) return false;
  return store().setShareToken(ws, id, null);
}
