import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { asc, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.ts';
import { auth } from './auth.ts';

export type Actor = { userId: string; email: string; name: string; image: string | null; workspaceId: string };

/** The workspace a request acts in: the session's active one if the user is
 *  still a member of it, else their oldest membership — the personal one. */
export async function workspaceOf(userId: string, active: string | null | undefined) {
  const m = schema.member;
  const [row] = await db()
    .select({ id: m.organizationId })
    .from(m)
    .where(eq(m.userId, userId))
    .orderBy(sql`(${m.organizationId} = ${active ?? ''}) desc`, asc(m.createdAt))
    .limit(1);
  return row?.id ?? null;
}

async function actorFrom(h: Headers): Promise<Actor | null> {
  const s = await auth().api.getSession({ headers: h });
  if (!s) return null;
  const workspaceId = await workspaceOf(s.user.id, s.session.activeOrganizationId);
  return workspaceId
    ? { userId: s.user.id, email: s.user.email, name: s.user.name, image: s.user.image ?? null, workspaceId }
    : null;
}

/** cache()d per request: the layout, the page and every streamed child ask. */
export const currentActor = cache(async () => actorFrom(await headers()));

/** For pages and server actions. proxy.ts only checks the cookie exists. */
export async function requireActor(): Promise<Actor> {
  const a = await currentActor();
  if (!a) redirect('/login');
  return a;
}

/** For /api/v1: Bearer only. A cookie-authenticated POST from another site is
 *  exactly what this refuses, so the API needs no CSRF story of its own. */
export async function apiActor(req: Request): Promise<Actor | null> {
  if (!/^bearer /i.test(req.headers.get('authorization') ?? '')) return null;
  return actorFrom(req.headers);
}

