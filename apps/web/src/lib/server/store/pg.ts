import 'server-only';
import { and, asc, desc, eq, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db, schema } from '../../db/index.ts';
import type { Store } from './types.ts';

/**
 * The Postgres adapter: every Drizzle call the app makes, moved here from
 * reports.ts, workspaces.ts, session.ts, health.ts and auth.ts. Raw data out;
 * the rules stay with the callers.
 */
const { reports: R, reportAssets: A, comments: C, user: U, member: M, organization: O } = schema;

const P = alias(A, 'poster');

/** LIKE treats % and _ as wildcards and \ as the escape; a search box does not. */
const likeable = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

const reportCols = {
  id: R.id, title: R.title, description: R.description, type: R.type, pageUrl: R.pageUrl,
  project: R.project, t0: R.t0, env: R.env, createdAt: R.createdAt,
};

async function assetsOf(reportId: string) {
  return db().select({ kind: A.kind, key: A.storageKey }).from(A).where(eq(A.reportId, reportId));
}

async function baseRow(where: ReturnType<typeof and>) {
  const [row] = await db().select({ ...reportCols, workspaceId: R.workspaceId }).from(R).where(where).limit(1);
  return row;
}

export const pgStore: Store = {
  // Liveness plus one round trip, so Docker marks the app unhealthy when
  // Postgres is unreachable rather than when the process dies.
  async health() {
    await db().execute(sql`select 1`);
  },

  authAdapter() {
    return drizzleAdapter(db(), {
      provider: 'pg',
      schema: {
        user: schema.user, session: schema.session, account: schema.account,
        verification: schema.verification, organization: schema.organization,
        member: schema.member, invitation: schema.invitation,
      },
    });
  },

  // ── list ──────────────────────────────────────────────────────────────────

  async listReports(ws, f) {
    const where = [eq(R.workspaceId, ws), eq(R.status, 'ready')];
    const q = f.q;
    if (q) where.push(or(ilike(R.title, likeable(q)), ilike(R.description, likeable(q)))!);
    if (f.types?.length) where.push(inArray(R.type, f.types));
    if (f.project) where.push(eq(R.project, f.project));
    if (f.after) where.push(lt(R.id, f.after));

    return db()
      .select({
        id: R.id, title: R.title, project: R.project, createdAt: R.createdAt, type: R.type,
        durationMs: R.durationMs, key: A.storageKey, posterKey: P.storageKey,
      })
      .from(R)
      .leftJoin(A, and(eq(A.reportId, R.id), inArray(A.kind, ['video', 'screenshot'])))
      .leftJoin(P, and(eq(P.reportId, R.id), eq(P.kind, 'poster')))
      .where(and(...where))
      .orderBy(desc(R.id))
      .limit(f.limit);
  },

  // ── one report ────────────────────────────────────────────────────────────

  async getReport(ws, id) {
    // The creator, owner side only: sharedReport() never names anyone.
    const [row] = await db()
      .select({ ...reportCols, shareToken: R.shareToken, byName: U.name, byEmail: U.email, byImage: U.image })
      .from(R)
      .leftJoin(U, eq(U.id, R.createdBy))
      .where(and(eq(R.workspaceId, ws), eq(R.id, id))).limit(1);
    if (!row) return null;
    const { shareToken: token, byName, byEmail, byImage, ...base } = row;
    return {
      ...base,
      assets: await assetsOf(base.id),
      shareToken: token,
      creator: byEmail ? { name: byName, email: byEmail, image: byImage } : null,
    };
  },

  async sharedReport(token) {
    const row = await baseRow(and(eq(R.shareToken, token), eq(R.status, 'ready')));
    return row ? { ...row, assets: await assetsOf(row.id) } : null;
  },

  async projectsOf(ws) {
    return db().select({ project: sql<string>`${R.project}`, count: sql<number>`count(*)::int` }).from(R)
      .where(and(eq(R.workspaceId, ws), eq(R.status, 'ready'), sql`${R.project} is not null`))
      .groupBy(R.project)
      .orderBy(sql`count(*) desc`, asc(R.project));
  },

  async commentsOf(ws, reportId) {
    return db()
      .select({ id: C.id, body: C.body, at: C.createdAt, by: U.email })
      .from(C)
      .leftJoin(U, eq(U.id, C.authorId))
      .where(and(eq(C.workspaceId, ws), eq(C.reportId, reportId), isNull(C.deletedAt)))
      .orderBy(asc(C.createdAt));
  },

  // ── plans ─────────────────────────────────────────────────────────────────

  async usageOf(userId) {
    const [u] = await db().select({
      plan: U.plan,
      limit: U.videoLimit,
      // Raw and aliased: drizzle writes columns unqualified here, and a bare
      // "id" inside the subquery would bind to reports.id, not the user's.
      videos: sql<number>`(select count(*)::int from rekod.reports r
        where r.created_by = rekod."user".id and r.type = 'video' and r.status = 'ready')`,
      lastHour: sql<number>`(select count(*)::int from rekod.reports r
        where r.created_by = rekod."user".id and r.created_at > now() - interval '1 hour')`,
    }).from(U).where(eq(U.id, userId));
    return u ?? null;
  },

  async setPlan(email, plan, videos) {
    const res = await db().update(U).set({ plan, videoLimit: videos })
      .where(eq(U.email, email)).returning({ id: U.id });
    return res.length > 0;
  },

  // ── writes ────────────────────────────────────────────────────────────────

  async insertReport(report, assets) {
    await db().insert(R).values(report);
    await db().insert(A).values(assets.map((a) => ({
      reportId: report.id, workspaceId: report.workspaceId, ...a,
    })));
  },

  async completeReport(ws, id, f) {
    const set: Partial<typeof R.$inferInsert> = { ...f, status: 'ready' };
    // The video limit, in the same UPDATE: a video becomes ready only while its
    // creator has fewer ready ones than their video_limit. An already-ready row
    // passes, so a retried /complete stays idempotent. `mine` and `u` are
    // aliased so that rekod.reports.created_by means the row being completed.
    const underCap = sql`(${R.type} <> 'video' or ${R.status} = 'ready' or (
      select count(*) from rekod.reports mine
      where mine.created_by = rekod.reports.created_by and mine.type = 'video' and mine.status = 'ready'
    ) < (select u.video_limit from rekod."user" u where u.id = rekod.reports.created_by))`;
    const res = await db().update(R).set(set)
      .where(and(eq(R.workspaceId, ws), eq(R.id, id), underCap)).returning({ id: R.id });
    return res.length > 0;
  },

  async updateReport(ws, id, fields) {
    const res = await db().update(R).set(fields).where(and(eq(R.workspaceId, ws), eq(R.id, id))).returning({ id: R.id });
    return res.length > 0;
  },

  async assetKeys(ws, ids) {
    const keys = await db().select({ key: A.storageKey }).from(A)
      .where(and(eq(A.workspaceId, ws), inArray(A.reportId, ids)));
    return keys.map((k) => k.key);
  },

  async deleteReports(ws, ids) {
    const res = await db().delete(R).where(and(eq(R.workspaceId, ws), inArray(R.id, ids))).returning({ id: R.id });
    return res.length;
  },

  async abandoned(olderThan, batch) {
    return db().select({ id: R.id, ws: R.workspaceId }).from(R)
      .where(and(eq(R.status, 'processing'), lt(R.createdAt, olderThan)))
      .limit(batch);
  },

  // ── comments ──────────────────────────────────────────────────────────────

  async addComment(ws, userId, reportId, body) {
    const [owned] = await db().select({ id: R.id }).from(R).where(and(eq(R.workspaceId, ws), eq(R.id, reportId)));
    if (!owned) return null;
    const [c] = await db().insert(C).values({ reportId, workspaceId: ws, authorId: userId, body })
      .returning({ id: C.id, body: C.body, at: C.createdAt });
    const [u] = await db().select({ email: U.email }).from(U).where(eq(U.id, userId));
    return { id: c.id, body: c.body, at: c.at, by: u?.email ?? null };
  },

  async deleteComment(ws, userId, commentId) {
    const res = await db().update(C).set({ deletedAt: new Date() })
      .where(and(eq(C.workspaceId, ws), eq(C.id, commentId), eq(C.authorId, userId)))
      .returning({ id: C.id });
    return res.length > 0;
  },

  // ── share ─────────────────────────────────────────────────────────────────

  async getShareToken(ws, id) {
    const [row] = await db().select({ token: R.shareToken }).from(R).where(and(eq(R.workspaceId, ws), eq(R.id, id)));
    return row ? row.token : undefined;
  },

  async setShareToken(ws, id, token) {
    const res = await db().update(R).set({ shareToken: token })
      .where(and(eq(R.workspaceId, ws), eq(R.id, id))).returning({ id: R.id });
    return res.length > 0;
  },

  // ── workspaces ────────────────────────────────────────────────────────────

  async workspaceOf(userId, active) {
    const [row] = await db()
      .select({ id: M.organizationId })
      .from(M)
      .where(eq(M.userId, userId))
      .orderBy(sql`(${M.organizationId} = ${active ?? ''}) desc`, asc(M.createdAt))
      .limit(1);
    return row?.id ?? null;
  },

  async workspacesOf(userId) {
    return db()
      .select({ id: O.id, name: O.name })
      .from(M)
      .innerJoin(O, eq(O.id, M.organizationId))
      .where(eq(M.userId, userId))
      .orderBy(asc(M.createdAt));
  },

  async ownedWorkspaces(userId) {
    // One round trip: the count is a subquery, the way usageOf() does it.
    const [u] = await db().select({
      plan: U.plan,
      owned: sql<number>`(select count(*)::int from rekod.member m
        where m.user_id = rekod."user".id and m.role = 'owner')`,
    }).from(U).where(eq(U.id, userId));
    return u ?? null;
  },
};
