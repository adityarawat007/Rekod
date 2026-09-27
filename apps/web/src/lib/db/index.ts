import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { serverEnv } from '../env.ts';
import * as schema from './schema.ts';

/**
 * The one Postgres handle. Only src/lib/server may import this — eslint
 * enforces it, because with no RLS the scoped repos there are the only thing
 * standing between a query and another workspace's rows.
 *
 * `prepare: false` so the same URL works against Supabase's transaction
 * pooler (port 6543), which cannot hold prepared statements, and plain
 * Postgres alike. Relative imports with extensions, so node's type stripping
 * can run the tenancy test against this exact file.
 */
let handle: ReturnType<typeof open> | undefined;

function open() {
  const client = postgres(serverEnv().DATABASE_URL, { prepare: false, max: 5 });
  return drizzle(client, { schema });
}

export const db = () => (handle ??= open());
export type Db = ReturnType<typeof db>;
export { schema };
