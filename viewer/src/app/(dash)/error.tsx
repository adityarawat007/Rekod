'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';

// One boundary for every dashboard route. The sidebar lives in the layout, so
// it survives — a failed query costs you the panel, not the app.
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

  // The one failure mode with a known fix: the dashboard columns are generated,
  // so a database still on schema.sql errors on every read.
  const needsMigration = error.message.includes('error_count');

  return (
    <>
      <PageHeader title="Something broke" />
      <div className="p-6 md:p-8">
        <Card className="max-w-2xl border-destructive/40">
          <CardContent className="space-y-4 py-6 text-sm">
            <p className="mono text-xs break-words text-muted-foreground">{error.message}</p>

            {needsMigration ? (
              <p>
                Run <span className="mono">schema-dashboard.sql</span> in the Supabase SQL editor —
                it adds the <span className="mono">error_count</span> and{' '}
                <span className="mono">failed_count</span> columns this page reads.
              </p>
            ) : (
              <p className="text-muted-foreground">
                This is usually transient. Retry, and check the Supabase logs if it sticks.
              </p>
            )}

            <div className="flex gap-2">
              <Button onClick={reset}>
                <RotateCw /> Try again
              </Button>
              <Button variant="outline" render={<Link href="/" />}>
                Back to recordings
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
