'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/home/page-header';

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
    <>
      <PageHeader title="Something broke" />
      <div className="p-6 md:p-8">
        <Card className="max-w-2xl border-destructive/40">
          <CardContent className="space-y-4 py-6 text-sm">
            <p className="mono text-xs break-words text-muted-foreground">{error.message}</p>

            {needsMigration ? (
              <p>
                A table or column this page reads is missing. Run{' '}
                <span className="mono">pnpm -C apps/web db:migrate</span> against this
                database&rsquo;s <span className="mono">DATABASE_URL</span>.
              </p>
            ) : (
              <p className="text-muted-foreground">
                This is usually transient. Retry, and check the server logs if it sticks.
              </p>
            )}

            <div className="flex gap-2">
              <Button onClick={reset}>
                <RotateCw /> Try again
              </Button>
              <Button variant="outline" render={<Link href="/" />}>
                Back to Rekods
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
