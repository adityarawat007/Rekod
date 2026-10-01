'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';

// Better Auth sends a failed Google round trip back here with ?error=<code>.
const ERRORS: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled.',
};
const errorText = (code: string | null) =>
  code ? ERRORS[code] ?? `Sign-in did not complete (${code.replace(/_/g, ' ')}).` : null;

/** Google is the only way in — sign-in and sign-up are the same button. */
export function SignIn({ google }: { google: boolean }) {
  const params = useSearchParams();
  // Same-origin paths only, or ?next= is an open redirect. `//host` and
  // `/\host` are protocol-relative, so a leading slash is not enough.
  const raw = params.get('next') || '/';
  const next = raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/';

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(errorText(params.get('error')));

  async function withGoogle() {
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: next, errorCallbackURL: '/login' });
    if (error) {
      setBusy(false);
      setError(error.message ?? 'Google sign-in failed.');
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="font-heading text-3xl font-extrabold">Sign in</h1>
      {google ? (
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="h-11 w-full gap-2.5 bg-card text-[15px]"
          onClick={withGoogle}
          disabled={busy}
        >
          <GoogleMark />
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </Button>
      ) : (
        // Said to whoever runs the instance, since nobody else can fix it.
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          Sign-in is not set up on this instance: it needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/8 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <p className="text-sm text-muted-foreground">New here? The same button creates your account.</p>
    </div>
  );
}

/** Google's brand rules want the "G" unaltered. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="size-[18px]">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
