import { apiActor } from '@/lib/server/session';
import { usageOf } from '@/lib/server/reports';

/** What the extension may do right now, asked before it starts a capture.
 *  The server decides and the extension only obeys, so a new rule later is a
 *  change here, not an extension update: `record` / `shot` say whether to
 *  start, and `message` + `path` are shown and opened when it says no. The
 *  real checks are still in createReport() — this is the early warning. */
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
    message: full ? `You have used all ${u.limit} ReKods on your plan. Delete one to record another.` : null,
    path: null,
  });
}
