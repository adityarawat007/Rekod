'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera, Check, Loader2, Play, Trash2, Video, X } from 'lucide-react';
import { ago, clock } from '@/lib/format';
import { GRID } from '@/components/skeletons';
import { Shortcut } from '@/components/home/shortcut';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { deleteReports, moreReports } from '@/app/(dash)/actions';
import type { PageQuery } from '@/app/(dash)/rekod/rows';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type ListRow = {
  id: string;
  title: string | null;
  project: string | null;
  created_at: string;
  shot: boolean;
  /** Signed media URL for the thumbnail; null falls back to an icon. */
  preview: string | null;
  durationMs: number | null;
};



/** ponytail: the frame is the video's own (`preload="metadata"` + `#t=`), one
 *  range request per card — 24 a page. After many pages of scrolling that is a
 *  lot of <video> elements; upload a poster from offscreen.js at record time
 *  when it shows. */
function Thumb({ row }: { row: ListRow }) {
  const { shot, preview: url } = row;
  const Icon = shot ? Camera : Video;

  return (
    <div className="relative aspect-video overflow-hidden border-b bg-cell">
      {url ? (
        shot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-full object-cover object-top" loading="lazy" />
        ) : (
          <video
            src={`${url}#t=0.5`}
            muted
            playsInline
            preload="metadata"
            aria-hidden
            className="size-full object-cover object-top"
          />
        )
      ) : (
        <div className="grid size-full place-items-center">
          <Icon className="size-6 text-muted-foreground" aria-hidden />
        </div>
      )}
      <span className="mono absolute bottom-2 right-2 inline-flex h-6 items-center gap-1.5 bg-chrome px-2 text-xs text-on-chrome">
        {shot ? (
          <><Camera className="size-3.5" aria-hidden /> Shot</>
        ) : (
          <><Play className="size-3 fill-current" aria-hidden /> {row.durationMs ? clock(row.durationMs / 1000) : 'Video'}</>
        )}
      </span>
    </div>
  );
}

/** §6.16: text only, inside a panel. The title block's "New rekod" is the
 *  view's one primary button, so this one points at the hotkey instead. */
function FirstRun() {
  return (
    <div className="space-y-3 border bg-panel px-[26px] py-6">
      <h2 className="text-xl">No rekods yet</h2>
      <p className="text-muted-foreground">
        With the extension installed, press the hotkey on any tab. The five minutes before it come too.
      </p>
      <Shortcut />
    </div>
  );
}

/** Loads the next page as the sentinel nears the viewport. The list is keyed
 *  on the filters upstream, so a new search starts over from page one. */
function useMorePages(first: ListRow[], firstNext: string | null, query: Omit<PageQuery, 'after'>) {
  const [items, setItems] = useState(first);
  const [next, setNext] = useState(firstNext);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!next || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const page = await moreReports({ ...query, after: next });
      setItems((xs) => [...xs, ...page.rows]);
      setNext(page.next);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !next || failed) return;
    // 800px early, so the next cards are usually there before you are.
    const io = new IntersectionObserver(([e]) => e.isIntersecting && load(), { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, failed, loading]);

  return { items, setItems, next, loading, failed, load, sentinel };
}

export function ReportList({
  rows,
  next: firstNext,
  query,
  empty,
}: {
  rows: ListRow[];
  next: string | null;
  query: Omit<PageQuery, 'after'>;
  empty?: React.ReactNode;
}) {
  const router = useRouter();
  const { items, setItems, next, loading, failed, load, sentinel } = useMorePages(rows, firstNext, query);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const toggle = (id: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  async function remove() {
    setBusy(true);
    setErr(null);
    try {
      await deleteReports([...sel]);
      // Pages past the first live only here, so they are pruned here.
      setItems((xs) => xs.filter((r) => !sel.has(r.id)));
      setSel(new Set());
      setConfirm(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!items.length) {
    return empty ? <div className="space-y-3 border bg-panel px-[26px] py-6">{empty}</div> : <FirstRun />;
  }

  const picked = items.filter((r) => sel.has(r.id));
  const shots = picked.filter((r) => r.shot).length;

  return (
    <div className="space-y-4">
      <ul className={GRID}>
        {items.map((r) => {
          const on = sel.has(r.id);
          return (
            // The checkbox is the link's sibling: inside an <a>, a click navigates.
            <li
              key={r.id}
              className={cn(
                'group relative border bg-panel transition-colors duration-150 hover:border-line-strong',
                on && 'outline-[2.5px] outline-offset-2 outline-selected outline-solid',
              )}
            >
              <Link href={`/reports/${r.id}`} className="block outline-none">
                <Thumb row={r} />
                {/* Two rows held open, so cards with and without titles align. */}
                <div className="min-h-[68px] space-y-1 px-3.5 py-3">
                  <p className="truncate font-medium text-ink group-hover:underline underline-offset-2">
                    {r.title || r.project || '—'}
                  </p>
                  <p className="mono flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                    <span className="min-w-0 truncate">{r.title && r.project ? r.project : shotOrVideo(r)}</span>
                    <span className="shrink-0" suppressHydrationWarning>{ago(r.created_at)}</span>
                  </p>
                </div>
              </Link>

              {/* §6.11 checkbox, 17px square; shown on hover, focus or once ticked. */}
              <label
                className={cn(
                  'absolute left-2 top-2 z-10 grid size-8 cursor-pointer place-items-center transition-opacity duration-150',
                  !on && 'opacity-0 focus-within:opacity-100 group-hover:opacity-100',
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(r.id)}
                  aria-label={`Select ${r.title || r.project || 'this rekod'}`}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className={cn(
                    'grid size-[17px] place-items-center border-[1.5px] border-line-strong bg-panel peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
                    on && 'border-ink bg-ink text-panel',
                  )}
                >
                  {on ? <Check className="size-3 [stroke-width:3]" /> : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {loading ? (
        <ul className={GRID} aria-hidden>
          {[0, 1, 2].map((n) => (
            <li key={n} className="border bg-panel">
              <Skeleton className="aspect-video w-full" />
              <div className="space-y-2 px-3.5 py-3">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {failed ? (
        <div className="flex justify-center py-6">
          <Button variant="outline" size="sm" onClick={load}>Couldn&apos;t load more. Retry</Button>
        </div>
      ) : null}
      {next ? <div ref={sentinel} aria-hidden className="h-px" /> : null}

      {/* §6.10: solid --primary, white text; pinned to the bottom of the view
          so it stays in reach on a long grid. */}
      {sel.size > 0 && (
        <div role="region" aria-label="Selection" className="sticky bottom-4 z-20 flex items-center gap-3 bg-primary py-2.5 pl-4 pr-3 text-on-primary">
          <button
            type="button"
            aria-label="Clear the selection"
            onClick={() => setSel(new Set())}
            className="grid size-8 shrink-0 place-items-center hover:bg-on-primary/10"
          >
            <X className="size-4" />
          </button>
          <span className="shrink-0 font-medium">{sel.size} selected</span>
          <span className="mono min-w-0 flex-1 truncate text-xs text-on-primary/75">
            {plural(sel.size - shots, 'video')} · {plural(shots, 'screenshot')}
          </span>
          <Button
            size="sm"
            onClick={() => setConfirm(true)}
            className="shrink-0 border-on-primary/45 bg-transparent text-on-primary hover:bg-on-primary/10"
          >
            <Trash2 /> Delete
          </Button>
        </div>
      )}

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {plural(sel.size, 'rekod')}?</DialogTitle>
            <DialogDescription>
              The recordings, their console and network logs and their comments all go, and any share link stops
              working. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {err ? <p role="alert" className="text-sm text-error">{err}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="destructive-solid" onClick={remove} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const shotOrVideo = (r: ListRow) => (r.shot ? 'Screenshot' : 'Video');
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
