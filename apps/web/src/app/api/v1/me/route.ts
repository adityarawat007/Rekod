import { apiActor } from '@/lib/server/session';
import { usageOf } from '@/lib/server/reports';

/** The extension's pre-capture check, so a new rule is a server change, not
 *  an extension release. Early warning only: createReport() is the gate. */
export async function GET(req: Request) {
  const actor = await apiActor(req);
  if (!actor) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const u = await usageOf(actor.userId);
  if (!u) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const full = u.videos >= u.limit;
  return Response.json({
    plan: u.plan,
    videos: u.videos,
    limit: u.limit,
    record: !full,
    shot: true,
    // ponytail: no path yet — it becomes '/settings/billing' when that page exists.
    message: full ? `You have used all ${u.limit} Rekods on your plan. Delete one to record another.` : null,
    path: null,
  });
}
