'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';

export type Deletable = { id: string; video_path: string | null };

/**
 * Delete recordings, media and all.
 *
 * Object first, row second. Both orders can leave an orphaned .webm if the
 * second half fails, but this one never leaves a report you can open and
 * cannot watch. RLS decides which rows and which objects either way — there is
 * no service key in this app and this runs as the signed-in owner.
 *
 * Storage removal is best-effort on purpose: an object that is already gone,
 * or a report filed without media, must not stop the row from going.
 */
export async function deleteReports(rows: Deletable[]) {
  const supabase = supabaseBrowser();
  const paths = rows.map((r) => r.video_path).filter((p): p is string => !!p);
  if (paths.length) await supabase.storage.from('reports').remove(paths);

  const { error } = await supabase
    .from('reports')
    .delete()
    .in('id', rows.map((r) => r.id));
  if (error) throw new Error(error.message);
}

/** The single-report control. Lives in the report header; on success there is
 *  no report left to render, so it leaves for the list. */
export function DeleteReportButton({ report }: { report: Deletable }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      await deleteReports([report]);
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
          <Button variant="outline" aria-label="Delete this recording">
            <Trash2 />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72">
        <PopoverTitle>Delete this recording?</PopoverTitle>
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
