import { Suspense } from 'react';
import { SignIn } from './sign-in';

export const metadata = { title: 'Sign in · FlamJam' };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="font-heading text-2xl font-extrabold tracking-tight">FlamJam</span>
        </div>
        <h1 className="font-heading text-3xl font-extrabold leading-none">
          Stop saying
          <br />
          &ldquo;works on my
          <br />
          machine.&rdquo;
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Your own bug reports, captured from the browser. Sign in here and the
          extension picks up the same session.
        </p>
        <Suspense>
          <SignIn />
        </Suspense>
      </div>
    </main>
  );
}
