import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { currentActor } from '@/lib/server/session';
import { googleEnabled } from '@/lib/server/auth';
import { Brand } from '@/components/shell/brand';
import { SignIn } from './sign-in';
import { Replay } from './replay';

export const metadata = { title: 'Sign in · Rekod' };

export default async function LoginPage() {
  // The real check proxy.ts deliberately does not make (it would loop).
  if (await currentActor()) redirect('/');

  return (
    <main className="grid min-h-dvh grid-cols-[minmax(0,1fr)] bg-background lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="relative hidden items-center justify-center overflow-hidden bg-zinc-950 px-12 lg:flex">
          <div
          aria-hidden
          className="absolute inset-0 opacity-[0.12] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]"
        />
        <div className="relative flex w-full flex-col items-center gap-10">
          <Replay />
          <p className="max-w-sm text-center font-heading text-2xl font-semibold leading-snug text-white">
            The five minutes before the bug, already on tape.
          </p>
        </div>
      </section>

      <section className="flex flex-col px-6 py-8 sm:px-10 lg:px-16">
        <Brand />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <Suspense>
            <SignIn google={googleEnabled()} />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
