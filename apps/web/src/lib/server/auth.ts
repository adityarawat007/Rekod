import 'server-only';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, organization } from 'better-auth/plugins';
import { db, schema } from '../db/index.ts';
import { serverEnv } from '../env.ts';

/**
 * Better Auth, built on first use (env is lazy — see lib/env.ts).
 *
 * The extension does not sign in. It reads this app's session cookie with
 * chrome.cookies and sends the value back as `Authorization: Bearer …`; the
 * bearer plugin turns that into a session. requireSignature: the cookie value
 * is always signed, so an unsigned bearer is never ours.
 */
function build() {
  const env = serverEnv();
  const google = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
    : undefined;

  const instance = betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db(), {
      provider: 'pg',
      schema: {
        user: schema.user, session: schema.session, account: schema.account,
        verification: schema.verification, organization: schema.organization,
        member: schema.member, invitation: schema.invitation,
      },
    }),
    // Google only. Off here, not just hidden on /login: with it on, Better
    // Auth's /sign-up/email would still take accounts from a curl. Google
    // verifies the address, which also makes one person, one account, harder
    // to dodge for the plan limits. Turning it back on needs SMTP first
    // (verification, reset) — see ROADMAP.
    emailAndPassword: { enabled: false },
    socialProviders: google,
    // Google verifies the email it hands back, so a Google sign-in with the
    // address of an existing password account is that account.
    // updateUserInfoOnLink: a password account that later links Google picks up
    // its name and picture. Better Auth never changes the email on a link.
    account: { accountLinking: { enabled: true, trustedProviders: ['google'], updateUserInfoOnLink: true } },
    // The signed session_data cookie answers getSession() for 5 minutes without
    // a database read; every dashboard request asks. A revoked session can
    // therefore outlive its revocation by up to that long.
    session: { cookieCache: { enabled: true, maxAge: 300 } },
    // `rekod.session_token` — apps/extension/auth.js reads it by this exact name.
    advanced: { cookiePrefix: 'rekod' },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (env.DISABLE_SIGNUP) throw new APIError('FORBIDDEN', { message: 'Sign-up is closed on this instance.' });
            const domain = user.email.split('@').pop()?.toLowerCase() ?? '';
            if (env.ALLOWED_EMAIL_DOMAINS.length && !env.ALLOWED_EMAIL_DOMAINS.includes(domain)) {
              throw new APIError('FORBIDDEN', { message: `Sign-up is limited to ${env.ALLOWED_EMAIL_DOMAINS.join(', ')}.` });
            }
          },
          // Every user owns a personal workspace from the first request. A
          // server call with `userId` is a system action, so this works even
          // though users may not create workspaces themselves.
          after: async (user) => {
            await instance.api.createOrganization({
              body: { name: user.name || user.email, slug: user.id.toLowerCase(), userId: user.id },
            });
          },
        },
      },
    },
    plugins: [
      // Team workspaces are Phase 3 and paid; until ee/ answers features.has,
      // nobody creates a second one.
      organization({ allowUserToCreateOrganization: false }),
      bearer({ requireSignature: true }),
    ],
  });
  return instance;
}

let instance: ReturnType<typeof build> | undefined;
export const auth = () => (instance ??= build());

export const googleEnabled = () => {
  const e = serverEnv();
  return !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
};
