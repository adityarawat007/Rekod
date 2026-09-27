'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

// The recipient has no account, so the dashboard's error.tsx would be worse
// than useless here — its "back to inbox" link bounces them to /login.
export default function SharedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-sm space-y-4 text-center">
        <p className="font-heading text-2xl font-extrabold">This report would not load</p>
        <p className="text-sm text-muted-foreground">
          The link is valid, so this is on our side rather than yours.
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
