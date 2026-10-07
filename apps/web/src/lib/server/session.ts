import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth.ts';
import { store } from './store/index.ts';

export type Actor = { userId: string; email: string; name: string; image: string | null; workspaceId: string };

/** The workspace a request acts in: the session's active one if the user is
 *  still a member of it, else their oldest membership — the personal one. */
export const workspaceOf = (userId: string, active: string | null | undefined) =>
  store().workspaceOf(userId, active);

async function actorFrom(h: Headers): Promise<Actor | null> {
  const s = await (await auth()).api.getSession({ headers: h });
  if (!s) return null;
  const workspaceId = await workspaceOf(s.user.id, s.session.activeOrganizationId);
  return workspaceId
    ? { userId: s.user.id, email: s.user.email, name: s.user.name, image: s.user.image ?? null, workspaceId }
    : null;
}

/** cache()d per request: the layout, the page and every streamed child ask. */
export const currentActor = cache(async () => actorFrom(await headers()));

/** Who is signed in, without the workspace lookup: the session alone comes
 *  from the 5-minute signed cookie cache, so this makes no query. For display
 *  only — anything that reads or writes rows goes through requireActor(). */
// headers() first, always: it is what marks the render dynamic. With auth()
// first, `next build` prerenders the shell, builds Better Auth, reads env, and
// fails on a machine with none (CI).
export const currentUser = cache(async () => {
  const h = await headers();
  return (await (await auth()).api.getSession({ headers: h }))?.user ?? null;
});

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

