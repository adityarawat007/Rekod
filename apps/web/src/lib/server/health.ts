import { store } from './store/index.ts';

/** Liveness plus one round trip, so Docker marks the app unhealthy when
 *  the database is unreachable rather than when the process dies. */
export async function health() {
  await store().health();
  return { ok: true as const };
}
