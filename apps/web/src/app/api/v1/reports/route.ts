import { apiActor } from '@/lib/server/session';
import { CreateInput, createReport } from '@/lib/server/reports';

/** Step 1 of an upload: the row, in `processing`, plus one presigned PUT per
 *  file. Metadata only — the recording and the logs go straight to the bucket,
 *  so nothing large passes through this function. */
export async function POST(req: Request) {
  const actor = await apiActor(req);
  if (!actor) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = CreateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }
  const created = await createReport(actor.workspaceId, actor.userId, parsed.data);
  if ('refused' in created) {
    // `message` is for people: the extension shows it as is, in the pill.
    const status = { videos: 403, rate: 429, size: 413 }[created.refused];
    return Response.json({ error: created.refused, message: created.message }, { status });
  }
  return Response.json(created, { status: 201 });
}
