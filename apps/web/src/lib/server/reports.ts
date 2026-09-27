import 'server-only';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/index.ts';
import { shareToken, uuidv7 } from '../db/ids.ts';
import { presignDownload, presignUpload, readJson, removeObject } from '../storage/index.ts';

/**
 * The scoped reports repo. EVERY function takes the workspace first and puts
 * it in the WHERE clause — that argument is the tenant boundary, there is no
 * RLS behind it. test-tenancy.ts checks each one against a second workspace.
 *
 * The one unscoped read is sharedReport(), where the token is the credential.
 */
const { reports: R, reportAssets: A, comments: C, user: U } = schema;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A malformed id is "not found", not a 22P02 from Postgres. */
const isId = (id: string) => UUID.test(id);

type Kind = 'video' | 'screenshot' | 'logs' | 'network';
const keyFor = (ws: string, id: string, kind: Kind) =>
  `${ws}/${id}/${kind}.${kind === 'video' ? 'webm' : kind === 'screenshot' ? 'png' : 'json'}`;

// ── list ────────────────────────────────────────────────────────────────────

export type ListFilters = { project?: string; q?: string; days?: number };

export type ListRow = {
  id: string;
  title: string;
  project: string | null;
  createdAt: Date;
  type: 'video' | 'screenshot';
  /** Signed thumbnail source, or null when the report has no media. */
  preview: string | null;
};

/** LIKE treats % and _ as wildcards and \ as the escape; a search box does not. */
const likeable = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

export async function listReports(ws: string, f: ListFilters = {}): Promise<ListRow[]> {
  const where = [eq(R.workspaceId, ws), eq(R.status, 'ready')];
  if (f.project) where.push(eq(R.project, f.project));
  const q = f.q?.trim();
  if (q) where.push(or(ilike(R.title, likeable(q)), ilike(R.description, likeable(q)))!);
  if (f.days) where.push(gte(R.createdAt, new Date(Date.now() - f.days * 864e5)));

  const rows = await db()
    .select({
      id: R.id, title: R.title, project: R.project, createdAt: R.createdAt, type: R.type,
      key: A.storageKey,
    })
    .from(R)
    .leftJoin(A, and(eq(A.reportId, R.id), inArray(A.kind, ['video', 'screenshot'])))
    .where(and(...where))
    .orderBy(desc(R.createdAt))
    // ponytail: 60 — every card is a range request for a video frame.
    // Paginate when the grid outgrows one screenful of scrolling.
    .limit(60);

  // Signing is a local HMAC, not a round trip, so one per row costs nothing.
  return Promise.all(rows.map(async ({ key, ...r }) => ({
    ...r, preview: key ? await presignDownload(key, 3600) : null,
  })));
}

/** Sidebar: the project list and the total, from one small read. */
export async function projectsOf(ws: string) {
  const rows = await db()
    .select({ project: R.project, n: count() })
    .from(R)
    .where(and(eq(R.workspaceId, ws), eq(R.status, 'ready')))
    .groupBy(R.project);
  return {
    projects: rows.map((r) => r.project).filter((p): p is string => !!p).sort(),
    total: rows.reduce((s, r) => s + r.n, 0),
  };
}

// ── one report ──────────────────────────────────────────────────────────────

export type CommentView = { id: string; body: string; at: string; by: string | null };

const reportCols = {
  id: R.id, title: R.title, description: R.description, type: R.type, pageUrl: R.pageUrl,
  project: R.project, t0: R.t0, env: R.env, createdAt: R.createdAt,
};

async function assetsOf(reportId: string) {
  return db().select({ kind: A.kind, key: A.storageKey }).from(A).where(eq(A.reportId, reportId));
}

async function commentsOf(reportId: string): Promise<CommentView[]> {
  const rows = await db()
    .select({ id: C.id, body: C.body, at: C.createdAt, by: U.email })
    .from(C)
    .leftJoin(U, eq(U.id, C.authorId))
    .where(and(eq(C.reportId, reportId), isNull(C.deletedAt)))
    .orderBy(asc(C.createdAt));
  return rows.map((c) => ({ ...c, at: c.at.toISOString() }));
}

async function baseRow(where: ReturnType<typeof and>) {
  const [row] = await db().select(reportCols).from(R).where(where).limit(1);
  return row;
}
type BaseRow = NonNullable<Awaited<ReturnType<typeof baseRow>>>;

/** Everything the player needs: signed media, the two log files, the thread. */
async function hydrate(row: BaseRow, withLogs = true) {
  const assets = await assetsOf(row.id);
  const key = (k: Kind) => assets.find((a) => a.kind === k)?.key;
  const mediaKey = key('video') ?? key('screenshot');
  const logsKey = withLogs ? key('logs') : undefined;
  const netKey = withLogs ? key('network') : undefined;
  const [logs, network, comments, mediaUrl] = await Promise.all([
    logsKey ? readJson<unknown[]>(logsKey) : [],
    netKey ? readJson<unknown[]>(netKey) : [],
    commentsOf(row.id),
    // An hour: a viewer who seeks after that re-opens the page.
    mediaKey ? presignDownload(mediaKey, 3600) : null,
  ]);
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    media: mediaUrl ? { url: mediaUrl, kind: row.type === 'screenshot' ? 'shot' as const : 'video' as const } : null,
    logs, network, comments,
  };
}

export async function getReport(ws: string, id: string) {
  if (!isId(id)) return null;
  const [row] = await db().select({ ...reportCols, shareToken: R.shareToken }).from(R)
    .where(and(eq(R.workspaceId, ws), eq(R.id, id))).limit(1);
  if (!row) return null;
  const { shareToken: token, ...base } = row;
  return { ...(await hydrate(base)), shareToken: token };
}

/** The whole anonymous surface. Explicit columns — no workspace, no creator,
 *  no token — and a processing report is not shareable yet. */
export async function sharedReport(token: string, withLogs = true) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await baseRow(and(eq(R.shareToken, token), eq(R.status, 'ready')));
  return row ? hydrate(row, withLogs) : null;
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
});

/** Creates the row in `processing` and hands back one presigned PUT per file.
 *  The bytes go extension → bucket; this server never sees them.
 *
 *  Two plain inserts, not a transaction: each round trip to the database is
 *  ~150ms from here and a transaction is four of them. If the second insert
 *  fails, what is left is a `processing` row nobody lists — harmless. The id
 *  is minted here so both inserts can name it. */
export async function createReport(ws: string, userId: string, input: z.infer<typeof CreateInput>) {
  const type = input.media?.startsWith('image/') ? 'screenshot' as const : 'video' as const;
  const id = uuidv7();
  const files: { kind: Kind; mime: string }[] = [
    ...(input.media ? [{ kind: type, mime: input.media.split(';')[0] }] : []),
    { kind: 'logs', mime: 'application/json' },
    { kind: 'network', mime: 'application/json' },
  ];

  await db().insert(R).values({
    id, workspaceId: ws, createdBy: userId, type,
    title: input.title, description: input.description || null,
    pageUrl: input.pageUrl ?? null, project: input.project ?? null,
    t0: input.t0, durationMs: input.durationMs ?? null, env: input.env,
  });
  await db().insert(A).values(files.map((f) => ({
    reportId: id, workspaceId: ws, kind: f.kind, mimeType: f.mime, storageKey: keyFor(ws, id, f.kind),
  })));

  // Presigning is a local HMAC — no round trip.
  const uploads: Partial<Record<'media' | 'logs' | 'network', string>> = {};
  for (const f of files) {
    uploads[f.kind === 'logs' || f.kind === 'network' ? f.kind : 'media'] = await presignUpload(keyFor(ws, id, f.kind));
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
  const set: Partial<typeof R.$inferInsert> = { status: 'ready' };
  if (f.title !== undefined) set.title = f.title;
  if (f.description !== undefined) set.description = f.description || null;
  if (f.pageUrl !== undefined) set.pageUrl = f.pageUrl;
  if (f.project !== undefined) set.project = f.project;
  if (f.env !== undefined) set.env = f.env;
  const res = await db().update(R).set(set)
    .where(and(eq(R.workspaceId, ws), eq(R.id, id))).returning({ id: R.id });
  return res.length > 0;
}

export async function updateReport(ws: string, id: string, fields: { title?: string; description?: string | null }) {
  if (!isId(id)) return false;
  const res = await db().update(R).set(fields).where(and(eq(R.workspaceId, ws), eq(R.id, id))).returning({ id: R.id });
  return res.length > 0;
}

/**
 * Objects first, then rows. Both orders can orphan a file if the second half
 * fails; this one never leaves a report you can open and cannot watch.
 * Removal is best-effort per object — a file already gone must not stop the row.
 */
export async function deleteReports(ws: string, ids: string[]) {
  const valid = ids.filter(isId);
  if (!valid.length) return 0;
  const keys = await db().select({ key: A.storageKey }).from(A)
    .where(and(eq(A.workspaceId, ws), inArray(A.reportId, valid)));
  await Promise.allSettled(keys.map((k) => removeObject(k.key)));
  const res = await db().delete(R).where(and(eq(R.workspaceId, ws), inArray(R.id, valid))).returning({ id: R.id });
  return res.length;
}

// ── comments ────────────────────────────────────────────────────────────────

export async function addComment(ws: string, userId: string, reportId: string, body: string): Promise<CommentView | null> {
  if (!isId(reportId)) return null;
  const [owned] = await db().select({ id: R.id }).from(R).where(and(eq(R.workspaceId, ws), eq(R.id, reportId)));
  if (!owned) return null;
  const [c] = await db().insert(C).values({ reportId, workspaceId: ws, authorId: userId, body })
    .returning({ id: C.id, body: C.body, at: C.createdAt });
  const [u] = await db().select({ email: U.email }).from(U).where(eq(U.id, userId));
  return { id: c.id, body: c.body, at: c.at.toISOString(), by: u?.email ?? null };
}

/** Soft delete, and only your own comment. */
export async function deleteComment(ws: string, userId: string, commentId: string) {
  if (!isId(commentId)) return false;
  const res = await db().update(C).set({ deletedAt: new Date() })
    .where(and(eq(C.workspaceId, ws), eq(C.id, commentId), eq(C.authorId, userId)))
    .returning({ id: C.id });
  return res.length > 0;
}

// ── share ───────────────────────────────────────────────────────────────────

/** The report's link token, minting one if it was revoked. Copyable any time. */
export async function shareTokenFor(ws: string, id: string) {
  if (!isId(id)) return null;
  const [row] = await db().select({ token: R.shareToken }).from(R).where(and(eq(R.workspaceId, ws), eq(R.id, id)));
  if (!row) return null;
  if (row.token) return row.token;
  const token = shareToken();
  await db().update(R).set({ shareToken: token }).where(and(eq(R.workspaceId, ws), eq(R.id, id)));
  return token;
}

/** Kills the current link. The next copy mints a new one. */
export async function revokeShare(ws: string, id: string) {
  if (!isId(id)) return false;
  const res = await db().update(R).set({ shareToken: null })
    .where(and(eq(R.workspaceId, ws), eq(R.id, id))).returning({ id: R.id });
  return res.length > 0;
}
