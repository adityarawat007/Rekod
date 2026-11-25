import 'server-only';
import { serverEnv } from '../env.ts';
import { store } from './store/index.ts';
import { deleteReports } from './reports.ts';
import type { DayCount } from './store/types.ts';

export type { AdminStats, AdminUser } from './store/types.ts';

/**
 * /admin: the reads across every workspace and the one delete that crosses
 * them. Nothing here checks who is asking — requireAdmin() in session.ts is
 * the gate, and every page and action under /admin calls it first. Counts and
 * sizes only: no admin read returns a report's contents.
 */

/** ADMIN_EMAILS, lowercased by env.ts. Unset: nobody. */
export const isAdmin = (email: string | null | undefined) =>
  !!email && serverEnv().ADMIN_EMAILS.includes(email.toLowerCase());

export const adminStats = () => store().adminStats();
export const adminUsers = () => store().adminUsers();
export const adminSites = (limit = 10) => store().adminSites(limit);
/** scripts/backfill-sizes.ts: the bucket's size for one object, by key. */
export const setAssetSize = (key: string, bytes: number) => store().setAssetSize(key, bytes);

/** The last `days` UTC days, oldest first, zeros filled in. */
export async function adminDaily(days = 30) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const { rekods, signups } = await store().adminDaily(start);
  const at = (list: DayCount[]) => new Map(list.map((d) => [d.day, d.count]));
  const r = at(rekods), s = at(signups);
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(start.getTime() + i * 86400e3).toISOString().slice(0, 10);
    return { day, rekods: r.get(day) ?? 0, signups: s.get(day) ?? 0 };
  });
}

/**
 * A user, with every workspace they own and everything in those: files
 * first, then rows (the deleteReports order). Refused for yourself, and for
 * anyone who owns a workspace with other members — deleting it would take
 * their rekods too. Their reports in workspaces they did not own stay there.
 */
export async function deleteUser(actorId: string, userId: string): Promise<{ ok: true } | { refused: string }> {
  if (userId === actorId) return { refused: 'You cannot delete your own account from here.' };
  const owned = await store().ownedWorkspaceIds(userId);
  const shared = owned.filter((w) => w.others > 0).length;
  if (shared) {
    return { refused: `They own ${shared === 1 ? 'a workspace' : `${shared} workspaces`} with other members. Remove the members first.` };
  }
  for (const w of owned) await deleteReports(w.id, await store().reportIdsIn(w.id));
  return (await store().deleteUser(userId, owned.map((w) => w.id))) ? { ok: true } : { refused: 'No such user.' };
}
