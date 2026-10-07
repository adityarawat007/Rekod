'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Ellipsis, FileText, Loader2, Trash2 } from 'lucide-react';
import { useCopy } from '@/components/report/copy-button';
import { useReportMarkdown } from '@/components/report/markdown-context';
import { deleteReports } from '@/app/(dash)/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** On a successful delete there is no report left, so it leaves for the list. */
export function ReportMenu({ id }: { id: string }) {
  const { state, copy } = useCopy();
  const md = useReportMarkdown();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setErr(null);
    try {
      await deleteReports([id]);
      router.push('/rekod');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon-lg" aria-label="More actions" />}>
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {/* Stays open so "Copied" can be seen. */}
          <DropdownMenuItem closeOnClick={false} onClick={() => md && copy(md.markdown())}>
            {state === 'copied' ? <Check /> : <FileText />}
            {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy as Markdown'}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setOpen(true)}>
            <Trash2 /> Delete rekod
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this rekod?</DialogTitle>
            <DialogDescription>
              The recording, its console and network log and its comments all go. Any share link for
              it stops working. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {err ? <p role="alert" className="text-sm text-error">{err}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive-solid" onClick={remove} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
