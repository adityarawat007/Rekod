'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDownToLine, Camera, Check, Link2, Loader2, Play, Trash2, Video, X } from 'lucide-react';
import { ago, clock } from '@/lib/format';
import { GRID } from '@/components/skeletons';
import { Shortcut } from '@/components/home/shortcut';
import { EXTENSION_KB, EXTENSION_VERSION, EXTENSION_ZIP, INSTALL_STEPS } from '@/components/install-steps';
import { useCopy } from '@/components/report/copy-button';
import { Button, buttonVariants } from '@/components/ui/button';
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
  /** Signed poster still for videos; null on older recordings. */
  poster: string | null;
  durationMs: number | null;
};



/** A video card shows its uploaded poster (offscreen.js, at record time) as a
 *  lazy <img>. ponytail: recordings from before posters existed keep the old
 *  <video preload="metadata" #t=0.5> — a range request per card, the webm has no
 *  cues — until they are deleted; nothing backfills them. */
function Thumb({ row }: { row: ListRow }) {
  const { shot, preview: url } = row;
  // A poster row whose upload never landed 404s: drop to the <video> fallback.
  const [poster, setPoster] = useState(row.poster);
  const Icon = shot ? Camera : Video;

  return (
    <div className="relative aspect-video overflow-hidden border-b bg-cell">
      {url ? (
        shot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-full object-cover object-top" loading="lazy" />
        ) : poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" className="size-full object-cover object-top" loading="lazy" decoding="async" onError={() => setPoster(null)} />
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

/** First run: a three-step checklist in a panel. Being signed in is the
 *  connection, so the middle step is a statement, not a task. */
function FirstRun() {
  return (
    <section className="space-y-6 border bg-panel px-4 py-6 narrow:px-[26px]">
      <h2 className="text-xl">No rekods yet</h2>
      <ol className="space-y-6">
        <Step n={1} title="Install the extension">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <a href={EXTENSION_ZIP} download className={buttonVariants({ size: 'sm' })}>
              <ArrowDownToLine /> Download
            </a>
            <span className="mono text-xs text-muted-foreground">
              Version {EXTENSION_VERSION}, a {EXTENSION_KB} KB zip
            </span>
          </div>
          <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground marker:font-mono marker:text-xs">
            {INSTALL_STEPS.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </Step>
        <Step n={2} title="You're already connected">
          <p className="text-muted-foreground">Being signed in here is the connection. There is nothing to paste.</p>
        </Step>
        <Step n={3} title={<span className="flex flex-wrap items-center gap-3">Press <Shortcut small /> on any tab</span>}>
          <p className="text-muted-foreground">
            Recording starts, and the five minutes before it come too. Your first rekod lands here when you press Send.
          </p>
        </Step>
      </ol>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="mono w-5 shrink-0 pt-px font-medium text-primary">{n}</span>
      <div className="min-w-0 flex-1 space-y-3">
        <h3 className="font-medium text-ink">{title}</h3>
        {children}
      </div>
    </li>
  );
}

/** Top-right, mirroring the checkbox. A sibling of the link, so a click never navigates. */
function CopyLink({ id }: { id: string }) {
  const { state, copy } = useCopy();
  const done = state === 'copied';
  const bad = state === 'failed';

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label="Copy link"
      title={done ? 'Copied' : bad ? 'Copy failed' : 'Copy link'}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); void copy(`${window.location.origin}/reports/${id}`); }}
      className={cn(
        'absolute right-2 top-2 z-10 bg-panel transition-opacity duration-150',
        // Touch has no hover: stay visible there rather than leave an invisible tap target.
        state === 'idle' && 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
      )}
    >
      {done ? <Check /> : <Link2 />}
      <span role="status" className="sr-only">{done ? 'Copied' : bad ? 'Copy failed' : ''}</span>
    </Button>
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
              <CopyLink id={r.id} />
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
