'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Better Auth sends a failed Google round trip back here with ?error=<code>.
const ERRORS: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled.',
};
const errorText = (code: string | null) =>
  code ? ERRORS[code] ?? `Sign-in did not complete (${code.replace(/_/g, ' ')}).` : null;

type Mode = 'signin' | 'signup';

export function SignIn({ google }: { google: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  // Only a same-origin path. proxy.ts always writes a pathname here, but the
  // login page is public and unauthenticated, so `?next=https://evil.example`
  // is a phishing redirect anyone can craft: sign in on the real site, land on
  // a fake one. `//host` and `/\host` are protocol-relative and leave the
  // origin too, so a leading-slash test alone is not enough.
  const raw = params.get('next') || '/';
  const next = raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/';

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(errorText(params.get('error')));

  async function withEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy('email');
    setError(null);
    const { error } = mode === 'signup'
      // No SMTP, so no confirmation step: the account is live on creation.
      ? await authClient.signUp.email({ email, password, name: email.split('@')[0] })
      : await authClient.signIn.email({ email, password });
    setBusy(null);
    if (error) return setError(error.message ?? 'Sign-in failed.');
    router.replace(next);
    router.refresh();
  }

  async function withGoogle() {
    setBusy('google');
    setError(null);
    // A full-page redirect to Google; the callback lands on `next`.
    const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: next, errorCallbackURL: '/login' });
    if (error) {
      setBusy(null);
      setError(error.message ?? 'Google sign-in failed.');
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="font-heading text-3xl font-extrabold">
        {mode === 'signin' ? 'Sign in' : 'Create your account'}
      </h1>
      {/* Only when the instance has a Google client configured — a
          self-hosted box without one still signs in with a password. */}
      {google ? (
        <>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="h-11 w-full gap-2.5 bg-card text-[15px]"
            onClick={withGoogle}
            disabled={busy !== null}
          >
            <GoogleMark />
            {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground" role="separator">
            <span className="h-px flex-1 bg-border" />
            or use email
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <form onSubmit={withEmail} className="space-y-3">
        <Input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email"
          className="h-11 bg-card px-3 text-[15px]"
        />
        <Input
          type="password"
          required
          minLength={8}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          placeholder={mode === 'signup' ? 'Password, 8 characters or more' : 'Password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label="Password"
          className="h-11 bg-card px-3 text-[15px]"
        />
        <Button type="submit" size="lg" className="h-11 w-full text-[15px]" disabled={busy !== null}>
          {busy === 'email' ? 'Signing in…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/8 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        {mode === 'signin' ? 'New here? ' : 'Already have an account? '}
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
          }}
          className="font-medium text-grape underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
        >
          {mode === 'signin' ? 'Create an account' : 'Sign in'}
        </button>
      </p>
    </div>
  );
}

/** Google's "G", in its own four colours — their brand rules want it unaltered. */
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
