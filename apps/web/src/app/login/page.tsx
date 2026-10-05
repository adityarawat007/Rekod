import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { currentActor } from '@/lib/server/session';
import { googleEnabled } from '@/lib/server/auth';
import { Brand } from '@/components/shell/brand';
import { SignIn } from './sign-in';
import { Replay } from '@/components/marketing/replay';

export const metadata = { title: 'Sign in · rekod' };

export default async function LoginPage() {
  // The real check proxy.ts deliberately does not make (it would loop).
  if (await currentActor()) redirect('/rekod');

  return (
    <main className="grid min-h-dvh grid-cols-[minmax(0,1fr)] bg-background lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* The onboarding welcome: a marketing surface, the one place the gradient may go (§2.4). */}
      <section className="relative hidden items-center justify-center overflow-hidden bg-electric px-12 lg:flex">
        <div className="relative flex w-full flex-col items-center gap-10">
          <Replay />
          <p className="max-w-sm text-center text-2xl font-semibold leading-snug tracking-[-0.015em] text-on-chrome">
            The five minutes before the bug, already on tape.
          </p>
        </div>
      </section>

      <section className="flex flex-col bg-panel px-6 py-8 sm:px-10 lg:px-16">
        <Brand href="/" />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <Suspense>
            <SignIn google={googleEnabled()} />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
