'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ERRORS: Record<string, string> = {
  exchange: 'Sign-in did not complete. Try again.',
};

type Mode = 'signin' | 'signup';

export function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'email' | null>(null);
  const [error, setError] = useState<string | null>(ERRORS[params.get('error') ?? ''] ?? null);
  const [sent, setSent] = useState(false);

  async function withEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy('email');
    setError(null);
    const supabase = supabaseBrowser();

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      setBusy(null);
      if (error) return setError(error.message);
      // No session means the project requires email confirmation first.
      if (!data.session) return setSent(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(null);
      if (error) return setError(error.message);
    }
    router.replace(next);
  }

  if (sent) {
    return (
      <p className="mt-8 rounded-lg border bg-muted/40 p-4 text-sm">
        Check <span className="mono">{email}</span> for a confirmation link, then come
        back and sign in.
      </p>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      {/* Google sign-in is not wired up yet. /auth/callback already handles the
          code exchange, so bringing it back is one signInWithOAuth call and one
          button — nothing here has to change to make room for it. */}
      <form onSubmit={withEmail} className="space-y-2.5">
        <Input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email"
        />
        <Input
          type="password"
          required
          minLength={8}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          placeholder={mode === 'signup' ? 'Password (8+ characters)' : 'Password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label="Password"
        />
        <Button type="submit" size="lg" className="w-full" disabled={busy !== null}>
          {busy === 'email'
            ? 'Working…'
            : mode === 'signup'
              ? 'Create account'
              : 'Sign in with email'}
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError(null);
        }}
        className="text-sm text-grape hover:underline"
      >
        {mode === 'signin' ? 'No account? Sign up' : 'Already have an account? Sign in'}
      </button>
    </div>
  );
}
