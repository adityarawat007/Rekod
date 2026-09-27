'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import { deleteReports } from '@/app/(dash)/actions';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';

/** The single-report control. Lives in the report header; on success there is
 *  no report left to render, so it leaves for the list. */
/** Files first, then the row — lib/server/reports.ts deleteReports() says why. */
export function DeleteReportButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      await deleteReports([id]);
      router.push('/');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" aria-label="Delete this ReKod">
            <Trash2 />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72">
        <PopoverTitle>Delete this ReKod?</PopoverTitle>
        <PopoverDescription>
          The video, the console and network log and the comments all go. Any share link for it
          stops working. This cannot be undone.
        </PopoverDescription>
        <Button variant="destructive" className="mt-3 w-full" onClick={go} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete
        </Button>
        {err ? (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {err}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
