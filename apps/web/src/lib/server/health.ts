import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/** Liveness plus one round trip, so Docker marks the app unhealthy when
 *  Postgres is unreachable rather than when the process dies. */
export async function health() {
  await db().execute(sql`select 1`);
  return { ok: true as const };
}
