import { serverEnv } from '@/lib/env';
import { purgeAbandoned } from '@/lib/server/reports';

/** Daily (vercel.json `crons`): deletes uploads nobody finished. Vercel sends
 *  `Authorization: Bearer $CRON_SECRET`; without the secret set, this answers
 *  nothing. Self-hosted: call it from any cron with the same header. */
export async function GET(req: Request) {
  const secret = serverEnv().CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  return Response.json({ deleted: await purgeAbandoned() });
}
