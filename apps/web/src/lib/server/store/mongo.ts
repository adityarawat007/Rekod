import 'server-only';
import { MongoClient, type Collection, type Db, type Document, type Filter } from 'mongodb';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { serverEnv } from '../../env.ts';
import { shareToken, uuidv7 } from '../../db/ids.ts';
import { PLANS } from '../../plans.ts';
import type { CommentRaw, Store } from './types.ts';

/**
 * The MongoDB adapter. Same contract as pg.ts, documented in ADAPTERS.md
 * ("MongoDB data model", "Where MongoDB differs"). No Mongoose, no migrations,
 * no replica set: the video cap rides a counter on the user document instead
 * of a cross-collection write.
 *
 * Every value that reaches a filter is a string, checked here. A JSON body can
 * carry `{ "$ne": null }` where an id was expected; reports.ts validates most
 * ids, but this file is the last line, so it does not trust its callers.
 */

const isStr = (v: unknown): v is string => typeof v === 'string';
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter(isStr) : []);
const escapeRe = (q: string) => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MEDIA = ['video', 'screenshot'];

/** Our ids are strings (UUIDv7), never ObjectIds. */
type Doc = Document & { _id: string };
type Handle = { client: MongoClient; db: Db };
let handle: Handle | undefined;
let indexed: Promise<void> | undefined;

/** The database name is the URL's path, `rekod` when it has none. */
function dbName(url: string) {
  const path = /^mongodb(?:\+srv)?:\/\/[^/?]*\/([^?]*)/.exec(url)?.[1];
  return path ? decodeURIComponent(path) : 'rekod';
}

function open(): Handle {
  const url = serverEnv().DATABASE_URL;
  const client = new MongoClient(url);
  return { client, db: client.db(dbName(url)) };
}

const h = () => (handle ??= open());
const col = (name: string): Collection<Doc> => h().db.collection(name);
const R = () => col('reports');
const C = () => col('comments');
const U = () => col('user');
const M = () => col('member');
const O = () => col('organization');

/** Ours, then every Better Auth index (its adapter creates none — three
 *  concurrent sign-ups with one email made three users). Idempotent; once per
 *  process, and a failure is not cached. */
function ensureIndexes(): Promise<void> {
  return (indexed ??= (async () => {
    const db = h().db;
    const ix = (c: string, key: Document, o: Document = {}) => db.collection(c).createIndex(key, o);
    await Promise.all([
      ix('reports', { workspaceId: 1, status: 1, _id: -1 }),
      ix('reports', { createdBy: 1, type: 1, status: 1 }),
      ix('reports', { createdBy: 1, createdAt: -1 }),
      ix('reports', { shareToken: 1 }, { unique: true, partialFilterExpression: { shareToken: { $type: 'string' } } }),
      ix('reports', { status: 1, createdAt: 1 }),
      ix('comments', { reportId: 1, createdAt: 1 }),
      ix('user', { email: 1 }, { unique: true }),
      ix('session', { token: 1 }, { unique: true }),
      ix('session', { userId: 1 }),
      ix('account', { providerId: 1, accountId: 1 }, { unique: true }),
      ix('account', { userId: 1 }),
      ix('organization', { slug: 1 }, { unique: true }),
      ix('member', { organizationId: 1, userId: 1 }, { unique: true }),
      ix('member', { userId: 1 }),
      ix('verification', { identifier: 1 }),
      ix('invitation', { organizationId: 1 }),
      ix('invitation', { email: 1 }),
    ]);
  })().catch((e) => {
    indexed = undefined;
    throw e;
  }));
}

/** Every method starts here: indexes first, then the handle. */
async function ready() {
  await ensureIndexes();
}

/** A search as a Mongo filter on title or description, literal like likeable(). */
const searchFilter = (q: string): Filter<Doc> => {
  const re = { $regex: escapeRe(q), $options: 'i' };
  return { $or: [{ title: re }, { description: re }] };
};

/** One `types` value, checked. `null`: the caller sent something that is not
 *  a list of media types, so nothing can match. */
function typesOf(types: unknown): string[] | undefined | null {
  if (types === undefined || types === null) return undefined;
  if (!Array.isArray(types)) return null;
  if (!types.length) return undefined; // an empty list is no filter, as in pg.ts
  return types.every((x) => isStr(x) && MEDIA.includes(x)) ? (types as string[]) : null;
}

const emailsOf = async (ids: (string | null | undefined)[]) => {
  const uniq = [...new Set(ids.filter(isStr))];
  const users = uniq.length ? await U().find({ _id: { $in: uniq } }, { projection: { email: 1 } }).toArray() : [];
  return new Map(users.map((u) => [String(u._id), isStr(u.email) ? u.email : null]));
};

const assetsOf = (d: Document): { kind: 'video' | 'screenshot' | 'logs' | 'network' | 'poster'; key: string }[] =>
  (Array.isArray(d.assets) ? d.assets : []).map((a: Document) => ({ kind: a.kind, key: a.storageKey }));

const baseOf = (d: Document) => ({
  id: String(d._id), title: d.title ?? '', description: d.description ?? null, type: d.type,
  pageUrl: d.pageUrl ?? null, project: d.project ?? null, t0: Number(d.t0),
  env: (d.env ?? {}) as Record<string, unknown>, createdAt: d.createdAt as Date,
});

const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** Give back a reserved slot. $inc, not a recount: concurrent reserves must
 *  not be overwritten with a stale number. */
const release = (userId: string) => U().updateOne({ _id: userId }, { $inc: { readyVideos: -1 } });

export const mongoStore: Store = {
  async health() {
    await h().db.command({ ping: 1 });
  },

  // authParts() awaits this before authAdapter(), so a failed createIndex
  // surfaces instead of Better Auth running without its unique indexes.
  init: ensureIndexes,

  authAdapter() {
    const { client, db } = h();
    return mongodbAdapter(db, { client, transaction: false });
  },

  // Unset → ObjectId, 'uuid' → BSON Binary; both break string lookups. A
  // function gives plain strings everywhere, like our workspaceId / createdBy.
  authOptions() {
    return { advanced: { database: { generateId: () => uuidv7() } } };
  },

  // ── list ──────────────────────────────────────────────────────────────────

  async listReports(ws, f) {
    await ready();
    if (!isStr(ws)) return [];
    const filter: Filter<Doc> = { workspaceId: ws, status: 'ready' };
    const and: Filter<Doc>[] = [];
    if (f.q) {
      if (!isStr(f.q)) return [];
      and.push(searchFilter(f.q));
    }
    const t = typesOf(f.types);
    if (t === null) return [];
    if (t) filter.type = { $in: t };
    if (f.project) {
      if (!isStr(f.project)) return [];
      filter.project = f.project;
    }
    if (f.after) {
      if (!isStr(f.after)) return [];
      filter._id = { $lt: f.after };
    }
    if (and.length) filter.$and = and;
    const limit = Number.isInteger(f.limit) && f.limit > 0 ? f.limit : 16;
    const docs = await R().find(filter, {
      projection: { title: 1, project: 1, createdAt: 1, type: 1, durationMs: 1, assets: 1 },
    }).sort({ _id: -1 }).limit(limit).toArray();
    return docs.map((d) => ({
      id: String(d._id), title: d.title ?? '', project: d.project ?? null, createdAt: d.createdAt as Date,
      type: d.type, durationMs: d.durationMs ?? null,
      key: assetsOf(d).find((a) => MEDIA.includes(a.kind))?.key ?? null,
      posterKey: assetsOf(d).find((a) => a.kind === 'poster')?.key ?? null,
    }));
  },

  // ── one report ────────────────────────────────────────────────────────────

  async getReport(ws, id) {
    await ready();
    if (!isStr(ws) || !isStr(id)) return null;
    const d = await R().findOne({ _id: id, workspaceId: ws });
    if (!d) return null;
    // The creator, owner side only: sharedReport() never names anyone.
    const u = isStr(d.createdBy)
      ? await U().findOne({ _id: d.createdBy }, { projection: { name: 1, email: 1, image: 1 } })
      : null;
    return {
      ...baseOf(d),
      assets: assetsOf(d),
      shareToken: isStr(d.shareToken) ? d.shareToken : null,
      creator: u && isStr(u.email) ? { name: u.name ?? null, email: u.email, image: u.image ?? null } : null,
    };
  },

  async sharedReport(token) {
    await ready();
    if (!isStr(token)) return null;
    // Explicit projection: the creator and the token stay in the database. The
    // workspace comes back for reports.ts to scope the comment read, then is dropped.
    const d = await R().findOne({ shareToken: token, status: 'ready' }, {
      projection: { workspaceId: 1, title: 1, description: 1, type: 1, pageUrl: 1, project: 1, t0: 1, env: 1, createdAt: 1, assets: 1 },
    });
    return d ? { ...baseOf(d), workspaceId: String(d.workspaceId), assets: assetsOf(d) } : null;
  },

  async projectsOf(ws) {
    await ready();
    if (!isStr(ws)) return [];
    const rows = await R().aggregate([
      { $match: { workspaceId: ws, status: 'ready', project: { $type: 'string' } } },
      { $group: { _id: '$project', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]).toArray();
    return rows.map((r) => ({ project: String(r._id), count: r.count as number }));
  },

  async commentsOf(ws, reportId) {
    await ready();
    if (!isStr(ws) || !isStr(reportId)) return [];
    const docs = await C().find({ workspaceId: ws, reportId, deletedAt: null }).sort({ createdAt: 1, _id: 1 }).toArray();
    const emails = await emailsOf(docs.map((d) => d.authorId));
    return docs.map((d): CommentRaw => ({
      id: String(d._id), body: d.body, at: d.createdAt, by: emails.get(String(d.authorId)) ?? null,
    }));
  },

  // ── plans ─────────────────────────────────────────────────────────────────

  async usageOf(userId) {
    await ready();
    if (!isStr(userId)) return null;
    const [u, videos, lastHour] = await Promise.all([
      U().findOne({ _id: userId }, { projection: { plan: 1, videoLimit: 1 } }),
      R().countDocuments({ createdBy: userId, type: 'video', status: 'ready' }),
      R().countDocuments({ createdBy: userId, createdAt: { $gt: new Date(Date.now() - 3600e3) } }),
    ]);
    if (!u) return null;
    return { plan: u.plan ?? 'free', limit: u.videoLimit ?? PLANS.free.videos, videos, lastHour };
  },

  async setPlan(email, plan, videos) {
    await ready();
    if (!isStr(email)) return false;
    const res = await U().updateOne({ email }, { $set: { plan, videoLimit: videos } });
    return res.matchedCount > 0;
  },

  // ── writes ────────────────────────────────────────────────────────────────

  async insertReport(r, assets) {
    await ready();
    await R().insertOne({
      _id: r.id, workspaceId: r.workspaceId, createdBy: r.createdBy, type: r.type, status: 'processing',
      title: r.title, description: r.description, pageUrl: r.pageUrl, project: r.project, t0: r.t0,
      durationMs: r.durationMs, env: r.env, createdAt: new Date(),
      // Born shareable, like the Postgres column default.
      shareToken: shareToken(),
      assets: assets.map((a) => ({ kind: a.kind, mimeType: a.mimeType, storageKey: a.storageKey })),
    });
  },

  /**
   * The video cap, without a replica set. The creator's user document carries
   * `readyVideos`; a slot is reserved with one conditional $inc (the cap check
   * and the increment are one atomic write), then the report flips to ready,
   * and a flip that matches nothing gives the slot back. An already-ready row
   * passes without a reservation (idempotent retry). A crash between the two
   * writes leaks a slot until recountVideos() runs in the cleanup job.
   */
  async completeReport(ws, id, f) {
    await ready();
    if (!isStr(ws) || !isStr(id)) return false;
    const mine = { _id: id, workspaceId: ws };
    const set = { ...defined(f), status: 'ready' };
    const d = await R().findOne(mine, { projection: { type: 1, status: 1, createdBy: 1 } });
    if (!d) return false;
    // Screenshots are not counted, and a ready row already holds its slot.
    if (d.type !== 'video' || d.status === 'ready') {
      return (await R().updateOne(mine, { $set: set })).matchedCount > 0;
    }
    const by = d.createdBy;
    if (!isStr(by)) return false;
    const slot = await U().findOneAndUpdate(
      { _id: by, $expr: { $lt: [{ $ifNull: ['$readyVideos', 0] }, { $ifNull: ['$videoLimit', PLANS.free.videos] }] } },
      { $inc: { readyVideos: 1 } },
      { projection: { _id: 1 } },
    );
    // No slot: full — unless a concurrent complete of this very report just
    // took the last one, in which case it is ready and this call is a retry.
    if (!slot) return (await R().countDocuments({ ...mine, status: 'ready' })) > 0;
    let flipped: boolean;
    try {
      flipped = (await R().updateOne({ ...mine, status: { $ne: 'ready' } }, { $set: set })).matchedCount > 0;
    } catch (e) {
      await release(by).catch(() => {});
      throw e;
    }
    if (flipped) return true;
    // Lost a race with another complete of this very report, or it was deleted.
    await release(by);
    return (await R().countDocuments({ ...mine, status: 'ready' })) > 0;
  },

  async updateReport(ws, id, fields) {
    await ready();
    if (!isStr(ws) || !isStr(id)) return false;
    const set = defined(fields);
    const mine = { _id: id, workspaceId: ws };
    if (!Object.keys(set).length) return (await R().countDocuments(mine)) > 0;
    return (await R().updateOne(mine, { $set: set })).matchedCount > 0;
  },

  async assetKeys(ws, ids) {
    await ready();
    if (!isStr(ws)) return [];
    const docs = await R().find({ _id: { $in: strs(ids) }, workspaceId: ws }, { projection: { assets: 1 } }).toArray();
    return docs.flatMap((d) => assetsOf(d).map((a) => a.key));
  },

  /** Ready videos go one by one so each one's creator gets exactly their slot
   *  back ($inc -1 on the user); everything else goes in one deleteMany. Rows
   *  that flipped to ready video in between are caught by the next round. */
  async deleteReports(ws, ids) {
    await ready();
    if (!isStr(ws)) return 0;
    const all = strs(ids);
    if (!all.length) return 0;
    const inWs = { _id: { $in: all }, workspaceId: ws };
    let n = 0;
    for (let round = 0; round < 3; round++) {
      const ready = await R().find({ ...inWs, type: 'video', status: 'ready' }, { projection: { createdBy: 1 } }).toArray();
      for (const v of ready) {
        const gone = await R().findOneAndDelete({ _id: v._id, workspaceId: ws, type: 'video', status: 'ready' }, { projection: { createdBy: 1 } });
        if (!gone) continue;
        n++;
        if (isStr(gone.createdBy)) await release(gone.createdBy);
      }
      const rest = await R().deleteMany({ ...inWs, $or: [{ type: { $ne: 'video' } }, { status: { $ne: 'ready' } }] });
      n += rest.deletedCount;
      if (!(await R().countDocuments(inWs))) break;
    }
    await C().deleteMany({ reportId: { $in: all }, workspaceId: ws });
    return n;
  },

  async abandoned(olderThan, batch) {
    await ready();
    const docs = await R().find({ status: 'processing', createdAt: { $lt: olderThan } }, { projection: { workspaceId: 1 } })
      .limit(batch).toArray();
    return docs.map((d) => ({ id: String(d._id), ws: String(d.workspaceId) }));
  },

  /** Repairs `readyVideos` from the truth in `reports`. Compare-and-set on the
   *  value it read, so a reserve that lands meanwhile is not overwritten; a
   *  slot reserved but not yet flipped at that instant can still be undercounted
   *  once, which a daily job accepts. */
  async recountVideos() {
    await ready();
    // Users first, truth second: a change in between makes the compare-and-set
    // below miss instead of overwriting a newer number with an older one.
    const users = await U().find({}, { projection: { readyVideos: 1 } }).toArray();
    const truth = new Map<string, number>();
    for await (const g of R().aggregate([
      { $match: { type: 'video', status: 'ready', createdBy: { $type: 'string' } } },
      { $group: { _id: '$createdBy', n: { $sum: 1 } } },
    ])) truth.set(String(g._id), g.n);
    let fixed = 0;
    for (const u of users) {
      const want = truth.get(String(u._id)) ?? 0;
      if (u.readyVideos === want) continue;
      const seen = u.readyVideos === undefined ? { $exists: false } : u.readyVideos;
      const res = await U().updateOne({ _id: u._id, readyVideos: seen }, { $set: { readyVideos: want } });
      fixed += res.modifiedCount;
    }
    return fixed;
  },

  // ── comments ──────────────────────────────────────────────────────────────

  async addComment(ws, userId, reportId, body) {
    await ready();
    if (!isStr(ws) || !isStr(userId) || !isStr(reportId) || !isStr(body)) return null;
    if (!(await R().countDocuments({ _id: reportId, workspaceId: ws }))) return null;
    const at = new Date();
    const id = uuidv7();
    await C().insertOne({ _id: id, reportId, workspaceId: ws, authorId: userId, body, createdAt: at, deletedAt: null });
    return { id, body, at, by: (await emailsOf([userId])).get(userId) ?? null };
  },

  async deleteComment(ws, userId, commentId) {
    await ready();
    if (!isStr(ws) || !isStr(userId) || !isStr(commentId)) return false;
    const res = await C().updateOne(
      { _id: commentId, workspaceId: ws, authorId: userId },
      { $set: { deletedAt: new Date() } },
    );
    return res.matchedCount > 0;
  },

  // ── share ─────────────────────────────────────────────────────────────────

  async getShareToken(ws, id) {
    await ready();
    if (!isStr(ws) || !isStr(id)) return undefined;
    const d = await R().findOne({ _id: id, workspaceId: ws }, { projection: { shareToken: 1 } });
    return d ? (isStr(d.shareToken) ? d.shareToken : null) : undefined;
  },

  async setShareToken(ws, id, token) {
    await ready();
    if (!isStr(ws) || !isStr(id) || (token !== null && !isStr(token))) return false;
    const res = await R().updateOne({ _id: id, workspaceId: ws }, { $set: { shareToken: token } });
    return res.matchedCount > 0;
  },

  // ── workspaces ────────────────────────────────────────────────────────────

  async workspaceOf(userId, active) {
    await ready();
    if (!isStr(userId)) return null;
    const ms = await M().find({ userId }, { projection: { organizationId: 1, createdAt: 1 } }).toArray();
    // A handful of rows: sort here. The active one first, then the oldest.
    ms.sort((a, b) =>
      Number(isStr(active) && b.organizationId === active) - Number(isStr(active) && a.organizationId === active) ||
      +a.createdAt - +b.createdAt);
    return ms[0] ? String(ms[0].organizationId) : null;
  },

  async workspacesOf(userId) {
    await ready();
    if (!isStr(userId)) return [];
    const ms = await M().find({ userId }, { projection: { organizationId: 1, createdAt: 1 } }).sort({ createdAt: 1 }).toArray();
    const orgs = await O().find({ _id: { $in: ms.map((m) => m.organizationId) } }, { projection: { name: 1 } }).toArray();
    const byId = new Map(orgs.map((o) => [String(o._id), o.name as string]));
    return ms.flatMap((m) => (byId.has(String(m.organizationId)) ? [{ id: String(m.organizationId), name: byId.get(String(m.organizationId))! }] : []));
  },

  async ownedWorkspaces(userId) {
    await ready();
    if (!isStr(userId)) return null;
    const [u, owned] = await Promise.all([
      U().findOne({ _id: userId }, { projection: { plan: 1 } }),
      M().countDocuments({ userId, role: 'owner' }),
    ]);
    return u ? { plan: u.plan ?? 'free', owned } : null;
  },
};
