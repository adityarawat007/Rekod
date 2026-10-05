import 'server-only';
import { cache } from 'react';
import { asc, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.ts';
import { uuidv7 } from '../db/ids.ts';
import { isPlan, PLANS } from '../plans.ts';
import { auth } from './auth.ts';

const { member: M, organization: O, user: U } = schema;

export type Workspace = { id: string; name: string };

/** Every workspace this user is a member of, the personal one first. Scoped by
 *  the user, not a workspace: this is the list you switch between. cache()d:
 *  the header and the page title both ask. */
export const workspacesOf = cache(async (userId: string): Promise<Workspace[]> =>
  db()
    .select({ id: O.id, name: O.name })
    .from(M)
    .innerJoin(O, eq(O.id, M.organizationId))
    .where(eq(M.userId, userId))
    .orderBy(asc(M.createdAt)),
);

/** How many more workspaces this user may create. Owned ones count, the
 *  personal one included, so free (limit 1) starts at 0. */
export async function workspacesLeft(userId: string) {
  // One round trip: the count is a subquery, the way usageOf() does it.
  const [u] = await db().select({
    plan: U.plan,
    owned: sql<number>`(select count(*)::int from rekod.member m
      where m.user_id = rekod."user".id and m.role = 'owner')`,
  }).from(U).where(eq(U.id, userId));
  const plan = u && isPlan(u.plan) ? u.plan : 'free';
  return { plan, left: Math.max(0, PLANS[plan].workspaces - (u?.owned ?? 0)) };
}

export type WorkspaceRefusal = { refused: 'plan' | 'limit'; message: string };

/** Creates a workspace owned by this user, if their plan has room. A system
 *  call (`userId`, no headers), because `allowUserToCreateOrganization` stays
 *  false: Better Auth's own create endpoint must not be a way around this. */
// ponytail: count, then create — two creates racing can both pass the limit
// and land one over. The ceiling is one extra workspace for someone clicking
// twice at once; a unique-per-slot constraint is the fix if that ever matters.
export async function createWorkspace(userId: string, name: string): Promise<{ id: string } | WorkspaceRefusal> {
  const { plan, left } = await workspacesLeft(userId);
  if (!left) {
    return plan === 'free'
      ? { refused: 'plan', message: 'New workspaces are part of Pro. Free includes your personal workspace.' }
      : { refused: 'limit', message: `Your plan includes ${PLANS[plan].workspaces} workspaces, and you own that many.` };
  }
  const org = await auth().api.createOrganization({
    body: { name, slug: uuidv7(), userId, keepCurrentActiveOrganization: true },
  });
  if (!org) throw new Error('Could not create the workspace');
  return { id: org.id };
}
