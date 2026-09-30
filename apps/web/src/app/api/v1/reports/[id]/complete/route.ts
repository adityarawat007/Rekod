import { apiActor } from '@/lib/server/session';
import { CompleteInput, completeReport } from '@/lib/server/reports';

/** Step 3: the extension has PUT every file, and the composer has been sent.
 *  The body carries what was typed (title, description) and the page it was
 *  on; the report becomes `ready` and appears on the grid. One UPDATE — see
 *  completeReport() for why it does not re-check the bucket. */
export async function POST(req: Request, ctx: RouteContext<'/api/v1/reports/[id]/complete'>) {
  const actor = await apiActor(req);
  if (!actor) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = CompleteInput.safeParse((await req.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    return Response.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }
  const { id } = await ctx.params;
  if (!(await completeReport(actor.workspaceId, id, parsed.data))) {
    // Also what a video over its creator's video_limit gets. Create refuses those first, so
    // only two uploads racing each other reach this.
    return Response.json({ error: 'not found' }, { status: 404 });
  }
  return Response.json({ id, path: `/reports/${id}` });
}
