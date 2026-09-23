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

  // The one failure mode with a known fix: a database that has not had every
  // migration applied is missing a column this app selects, and PostgREST says
  // so in those words. (It used to sniff for `error_count` by name — that column
  // is no longer read by anything, so the hint would never have fired again.)
  const needsMigration = /does not exist|schema cache/i.test(error.message);

  return (
    <>
      <PageHeader title="Something broke" />
      <div className="p-6 md:p-8">
        <Card className="max-w-2xl border-destructive/40">
          <CardContent className="space-y-4 py-6 text-sm">
            <p className="mono text-xs break-words text-muted-foreground">{error.message}</p>

            {needsMigration ? (
              <p>
                A column this page reads is missing. Apply the migrations in the Supabase SQL
                editor, in the order listed in <span className="mono">CLAUDE.md</span> — starting
                with <span className="mono">schema.sql</span>. They are all re-runnable.
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
                Back to ReKods
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
