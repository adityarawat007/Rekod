import { apiActor } from '@/lib/server/session';
import { deleteReports } from '@/lib/server/reports';

/** The extension's discard: a capture thrown away in the composer was already
 *  uploading, so its files and its `processing` row go. Files first, then the
 *  row — see deleteReports(). */
export async function DELETE(req: Request, ctx: RouteContext<'/api/v1/reports/[id]'>) {
  const actor = await apiActor(req);
  if (!actor) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await deleteReports(actor.workspaceId, [id]))) return Response.json({ error: 'not found' }, { status: 404 });
  return new Response(null, { status: 204 });
}
