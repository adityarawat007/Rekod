/**
 * The two public Supabase values, read once and checked.
 *
 * These were three `process.env.X!` assertions, and the `!` is a lie the moment
 * a deploy is missing them: `createServerClient(undefined, undefined)` throws
 * inside proxy.ts, which runs on EVERY request — so even a prerendered static
 * page answers 500 with no page, no stack and no clue. Naming the problem here
 * costs ten lines and turns that into a log line that says what to do.
 *
 * NEXT_PUBLIC_* is inlined at build time, so setting these in the host after a
 * build changes nothing until you redeploy. That is the usual cause.
 */
function required(name: string, value: string | undefined): string {
  if (value) return value;
  throw new Error(
    `${name} is not set. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY ` +
      `to the deployment's environment variables, then REDEPLOY — NEXT_PUBLIC_* values are ` +
      `inlined at build time, so saving them without a new build has no effect. ` +
      `Both are public by design; see viewer/.env.local.example.`,
  );
}

export const SUPABASE_URL = required(
  'NEXT_PUBLIC_SUPABASE_URL',
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
export const SUPABASE_ANON_KEY = required(
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
