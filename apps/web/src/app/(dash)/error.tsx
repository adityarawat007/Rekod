'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // A missing migration. Production redacts the message, so this is dev-only.
  const needsMigration = /does not exist/i.test(error.message);

  return (
    <div className="p-4 narrow:p-7">
      {/* §6.5 panel; §8: what happened, then what to do. */}
      <div className="max-w-2xl space-y-4 border border-error bg-panel px-[26px] py-6">
        <h2 className="text-xl">Something broke</h2>
        <p className="mono text-xs break-words text-muted-foreground">{error.message}</p>

        {needsMigration ? (
          <p>
            A table or column this page reads is missing. Run{' '}
            <span className="mono">pnpm -C apps/web db:migrate</span> against this
            database&rsquo;s <span className="mono">DATABASE_URL</span>.
          </p>
        ) : (
          <p className="text-muted-foreground">
            This is usually transient. Try again, and check the server logs if it sticks.
          </p>
        )}

        <div className="flex gap-2">
          <Button onClick={reset}>
            <RotateCw /> Try again
          </Button>
          <Button variant="outline" render={<Link href="/rekod" />}>
            Back to rekods
          </Button>
        </div>
      </div>
    </div>
  );
}
