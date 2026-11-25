import 'server-only';
import { and, asc, desc, eq, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db, schema } from '../../db/index.ts';
import type { AdminUser, Kind, Store } from './types.ts';

/**
 * The Postgres adapter: every Drizzle call the app makes, moved here from
 * reports.ts, workspaces.ts, session.ts, health.ts and auth.ts. Raw data out;
 * the rules stay with the callers.
 */
const { reports: R, reportAssets: A, comments: C, user: U, member: M, organization: O } = schema;

const P = alias(A, 'poster');

/** Raw rows for the admin reads: postgres-js returns bigint as a string. */
const rows = async <T>(q: ReturnType<typeof sql>) => (await db().execute(q)) as unknown as T[];
const num = (v: unknown) => Number(v ?? 0);

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

  // ── admin ─────────────────────────────────────────────────────────────────
  // Unscoped on purpose: requireAdmin() is the gate. One round trip each.

  async adminStats() {
    const [s] = await rows<Record<string, unknown>>(sql`select
      (select count(*) from rekod."user") as users,
      (select count(*) from rekod."user" where created_at > now() - interval '7 days') as users7,
      (select count(*) from rekod."user" where created_at > now() - interval '30 days') as users30,
      (select count(*) from rekod."user" where plan = 'pro') as pro,
      (select count(*) from rekod.organization) as workspaces,
      (select count(*) from rekod.reports where status = 'ready' and type = 'video') as videos,
      (select count(*) from rekod.reports where status = 'ready' and type = 'screenshot') as screenshots,
      (select count(*) from rekod.reports where status = 'processing') as processing,
      (select count(*) from rekod.reports where status = 'ready' and share_token is not null) as shared,
      (select count(*) from rekod.report_assets where size_bytes is null) as unsized,
      pg_database_size(current_database()) as db_bytes`);
    const kinds = await rows<{ kind: Kind; bytes: unknown }>(sql`
      select kind, coalesce(sum(size_bytes), 0) as bytes from rekod.report_assets group by kind`);
    return {
      users: num(s.users), users7: num(s.users7), users30: num(s.users30), pro: num(s.pro),
      workspaces: num(s.workspaces), videos: num(s.videos), screenshots: num(s.screenshots),
      processing: num(s.processing), shared: num(s.shared), unsized: num(s.unsized), dbBytes: num(s.db_bytes),
      bytes: Object.fromEntries(kinds.map((k) => [k.kind, num(k.bytes)])),
    };
  },

  async adminUsers() {
    const list = await rows<Record<string, unknown>>(sql`select u.id, u.name, u.email, u.image, u.created_at,
      u.plan, u.video_limit,
      (select count(*) from rekod.reports r where r.created_by = u.id and r.status = 'ready' and r.type = 'video') as videos,
      (select count(*) from rekod.reports r where r.created_by = u.id and r.status = 'ready' and r.type = 'screenshot') as screenshots,
      (select max(r.created_at) from rekod.reports r where r.created_by = u.id and r.status = 'ready') as last_at,
      (select coalesce(sum(a.size_bytes), 0) from rekod.report_assets a
        join rekod.reports r on r.id = a.report_id where r.created_by = u.id) as bytes,
      (select count(*) from rekod.member m where m.user_id = u.id and m.role = 'owner') as owned
      from rekod."user" u order by u.created_at desc`);
    return list.map((u): AdminUser => ({
      id: String(u.id), name: String(u.name), email: String(u.email), image: (u.image as string) ?? null,
      createdAt: new Date(u.created_at as string), plan: String(u.plan), videoLimit: num(u.video_limit),
      videos: num(u.videos), screenshots: num(u.screenshots),
      lastAt: u.last_at ? new Date(u.last_at as string) : null, bytes: num(u.bytes), owned: num(u.owned),
    }));
  },

  async adminDaily(since) {
    // UTC days. user.created_at has no time zone and the server writes UTC.
    // A string, not a Date: postgres-js cannot bind a Date in a raw query.
    const from = since.toISOString();
    const [rekods, signups] = await Promise.all([
      rows<{ day: string; count: unknown }>(sql`select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day,
        count(*) as count from rekod.reports where status = 'ready' and created_at >= ${from}::timestamptz group by 1`),
      rows<{ day: string; count: unknown }>(sql`select to_char(created_at, 'YYYY-MM-DD') as day,
        count(*) as count from rekod."user" where created_at >= ${from}::timestamp group by 1`),
    ]);
    const days = (r: { day: string; count: unknown }[]) => r.map((d) => ({ day: d.day, count: num(d.count) }));
    return { rekods: days(rekods), signups: days(signups) };
  },

  async adminSites(limit) {
    return db().select({ project: sql<string>`${R.project}`, count: sql<number>`count(*)::int` }).from(R)
      .where(and(eq(R.status, 'ready'), sql`${R.project} is not null`))
      .groupBy(R.project)
      .orderBy(sql`count(*) desc`, asc(R.project))
      .limit(limit);
  },

  async ownedWorkspaceIds(userId) {
    const list = await rows<{ id: string; others: unknown }>(sql`select m.organization_id as id,
      (select count(*) from rekod.member o where o.organization_id = m.organization_id and o.user_id <> m.user_id) as others
      from rekod.member m where m.user_id = ${userId} and m.role = 'owner'`);
    return list.map((w) => ({ id: w.id, others: num(w.others) }));
  },

  async reportIdsIn(ws) {
    return (await db().select({ id: R.id }).from(R).where(eq(R.workspaceId, ws))).map((r) => r.id);
  },

  async deleteUser(userId, wsIds) {
    // Workspaces cascade to members, invitations, reports, assets, comments;
    // the user to sessions, accounts and other memberships. Their reports in
    // workspaces they did not own stay, with created_by set null.
    if (wsIds.length) await db().delete(O).where(inArray(O.id, wsIds));
    const res = await db().delete(U).where(eq(U.id, userId)).returning({ id: U.id });
    return res.length > 0;
  },

  async setAssetSize(key, bytes) {
    await db().update(A).set({ sizeBytes: bytes }).where(eq(A.storageKey, key));
  },
};
