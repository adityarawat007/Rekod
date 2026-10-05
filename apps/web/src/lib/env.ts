import { z } from 'zod';

/**
 * Server-only settings, checked on first use rather than at import, so a build
 * (which imports every route) needs none of them, and a missing value fails
 * with its name instead of a blank 500.
 */
const list = z.string().optional().transform((s) =>
  // Strip quotes: a dashboard (Vercel) keeps `""` literally, which read as one domain named `""`.
  (s ?? '').split(',').map((x) => x.trim().replace(/^["']|["']$/g, '').trim().toLowerCase()).filter(Boolean));
const flag = z.string().optional().transform((s) => s === 'true' || s === '1');
/** An optional value where `NAME=` (empty) means unset, as .env.example writes it. */
const unsetIfEmpty = (t: z.ZodString) =>
  z.string().optional().transform((s) => s || undefined).pipe(t.optional());

const schema = z.object({
  DATABASE_URL: z.url(),

  BETTER_AUTH_SECRET: z.string().min(32, 'at least 32 characters — `openssl rand -base64 32`'),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** true: nobody new can sign up, by any method. */
  DISABLE_SIGNUP: flag,
  /** Comma-separated. Empty means any domain. */
  ALLOWED_EMAIL_DOMAINS: list,

  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),

  /** Bearer for /api/cron/cleanup. Unset: the job refuses every caller. */
  CRON_SECRET: unsetIfEmpty(z.string().min(16)),
  /** e.g. 0.3.0. Older extensions (or ones sending no version) get a 426
   *  "please update" from /api/v1. Unset: every version is accepted. */
  MIN_EXTENSION_VERSION: unsetIfEmpty(z.string().regex(/^\d+(\.\d+)*$/)),
});

export type ServerEnv = z.infer<typeof schema>;

let parsed: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (parsed) return parsed;
  const r = schema.safeParse(process.env);
  if (!r.success) {
    const names = r.error.issues.map((i) => `${i.path.join('.')} (${i.message})`).join(', ');
    throw new Error(`Missing or invalid server env: ${names}. See apps/web/.env.example.`);
  }
  return (parsed = r.data);
}
