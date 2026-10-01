'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera, Loader2, Play, SearchX, Trash2, Video, X } from 'lucide-react';
import { ago, clock } from '@/lib/format';
import { GRID } from '@/components/skeletons';
import { Shortcut } from '@/components/home/shortcut';
import { Button } from '@/components/ui/button';
import { deleteReports, moreReports } from '@/app/(dash)/actions';
import type { PageQuery } from '@/app/(dash)/(home)/rows';
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
    <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
      {url ? (
        shot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.015]" loading="lazy" />
        ) : (
          <video
            src={`${url}#t=0.5`}
            muted
            playsInline
            preload="metadata"
            aria-hidden
            className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.015]"
          />
        )
      ) : (
        <div className="grid size-full place-items-center">
          <Icon className="size-6 text-muted-foreground" aria-hidden />
        </div>
      )}
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-black/[0.06] ring-inset transition-shadow group-hover:ring-black/15" />
      <span className="absolute bottom-2.5 right-2.5 inline-flex h-6 items-center gap-1 rounded-md bg-black/70 px-1.5 text-xs font-medium text-white backdrop-blur-sm">
        {shot ? (
          <Camera className="size-3.5" aria-label="Screenshot" />
        ) : (
          <><Play className="size-3 fill-current" aria-hidden /> <span className="tabular-nums">{row.durationMs ? clock(row.durationMs / 1000) : 'Video'}</span></>
        )}
      </span>
    </div>
  );
}

/** A workspace with nothing in it yet: one picture, one line, one action. */
function FirstRun() {
  return (
    <div className="flex flex-col items-center gap-5 px-5 pt-20 text-center">
      <div className="relative h-28 w-72" aria-hidden>
        {[-6, 0, 6].map((deg, i) => (
          <div
            key={deg}
            style={{ transform: `translateX(${(i - 1) * 64}px) rotate(${deg}deg)` }}
            className={cn(
              'absolute inset-x-12 aspect-video rounded-xl border bg-muted shadow-sm',
              i === 1 ? 'top-0 z-10 bg-card p-1.5' : 'top-2',
            )}
          >
            {i === 1 ? (
              <>
                <div className="relative h-[62%] space-y-1.5 rounded-lg bg-zinc-900 p-2.5">
                  <div className="h-1.5 w-12 rounded bg-white/25" />
                  <div className="h-1.5 w-20 rounded bg-white/15" />
                  <span className="absolute bottom-1.5 right-1.5 inline-flex h-4 items-center gap-1 rounded bg-black/70 px-1 text-[10px] font-medium text-white">
                    <Play className="size-2 fill-current" /> 0:34
                  </span>
                </div>
                <div className="mt-2 space-y-1.5 px-0.5">
                  <div className="h-2 w-24 rounded bg-muted" />
                  <div className="h-2 w-14 rounded bg-muted/70" />
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <p className="text-base font-semibold">Record your first Rekod</p>
        <p className="text-sm text-muted-foreground">On any tab, with the extension installed:</p>
      </div>
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
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!items.length) {
    return empty ? (
      <div className="flex flex-col items-center gap-3 px-5 pt-28 text-center">
        <span className="grid size-10 place-items-center rounded-xl bg-muted">
          <SearchX className="size-5 text-muted-foreground" />
        </span>
        {empty}
      </div>
    ) : (
      <FirstRun />
    );
  }

  return (
    <div className="space-y-3">
      {sel.size > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-2 pl-4 shadow-lg shadow-black/5">
          <span className="text-sm font-medium">
            {sel.size} selected
          </span>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
            <X /> Clear
          </Button>
          <Button size="sm" variant="destructive" className="ml-auto" onClick={remove} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Delete {sel.size === 1 ? 'Rekod' : 'Rekods'}
          </Button>
          {err ? (
            <p role="alert" className="w-full text-xs text-destructive">
              {err}
            </p>
          ) : null}
        </div>
      )}

      <ul className={GRID}>
        {items.map((r) => {
          const on = sel.has(r.id);
          return (
            // The checkbox is the link's sibling: inside an <a>, a click navigates.
            <li key={r.id} className="group relative">
              <Link
                href={`/reports/${r.id}`}
                className={cn(
                  'block space-y-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4',
                  on && '[&_.aspect-video]:ring-2 [&_.aspect-video]:ring-foreground',
                )}
              >
                <Thumb row={r} />
                {/* Two rows held open, so cards with and without titles align. */}
                <div className="min-h-11 space-y-0.5 px-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-medium underline-offset-2 group-hover:underline">
                      {r.title || r.project || '—'}
                    </p>
                    <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground" suppressHydrationWarning>
                      {ago(r.created_at)}
                    </span>
                  </div>
                  {r.title && r.project ? (
                    <p className="truncate text-[13px] text-muted-foreground">{r.project}</p>
                  ) : null}
                </div>
              </Link>

              <label
                className={cn(
                  'absolute left-2.5 top-2.5 z-10 grid size-6 cursor-pointer place-items-center rounded-md bg-white/90 shadow-sm ring-1 ring-black/10 backdrop-blur transition-opacity',
                  !on && 'opacity-0 focus-within:opacity-100 group-hover:opacity-100',
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(r.id)}
                  aria-label={`Select the Rekod from ${r.project ?? 'an unknown project'}`}
                  className="size-3.5 accent-foreground"
                />
              </label>
            </li>
          );
        })}
      </ul>

      {loading ? (
        <ul className={GRID} aria-hidden>
          {[0, 1, 2].map((n) => (
            <li key={n} className="space-y-3">
              <Skeleton className="aspect-video w-full rounded-xl" />
              <Skeleton className="h-4 w-36" />
            </li>
          ))}
        </ul>
      ) : null}
      {failed ? (
        <div className="flex justify-center py-6">
          <Button variant="outline" size="sm" onClick={load}>Couldn&apos;t load more — retry</Button>
        </div>
      ) : null}
      {next ? <div ref={sentinel} aria-hidden className="h-px" /> : null}
    </div>
  );
}
