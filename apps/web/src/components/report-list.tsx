'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera, Loader2, Trash2, Video, X } from 'lucide-react';
import { ago } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { deleteReports } from '@/app/(dash)/actions';
import { cn } from '@/lib/utils';

export type ListRow = {
  id: string;
  title: string | null;
  project: string | null;
  created_at: string;
  shot: boolean;
  /** Signed media URL for the thumbnail; null falls back to an icon. */
  preview: string | null;
};

// ponytail: the card counted errors and failed requests here. A count with no
// context is a verdict on a recording nobody has watched — every report has a
// red number on it, and the ones that matter are not the ones with the biggest.
// The counts still live in the log pane of the report itself, where they are
// next to what they are counting.

/**
 * The thumbnail.
 *
 * ponytail: the frame comes from the video itself — `preload="metadata"` plus a
 * `#t=` fragment, so Chrome fetches the header and one frame rather than the
 * file. No poster is stored anywhere. The ceiling is the row count: this is a
 * range request per card, so it holds for tens of reports and not hundreds.
 * When it stops holding, grab a frame to canvas in `offscreen.js` at record
 * time and upload a real poster beside the video.
 */
function Thumb({ row }: { row: ListRow }) {
  const { shot, preview: url } = row;
  const Icon = shot ? Camera : Video;

  return (
    <div className="relative aspect-video overflow-hidden rounded-md border bg-muted">
      {url ? (
        shot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <video
            src={`${url}#t=0.5`}
            muted
            playsInline
            preload="metadata"
            aria-hidden
            className="size-full object-cover"
          />
        )
      ) : (
        <div className="grid size-full place-items-center">
          <Icon className="size-6 text-muted-foreground" aria-hidden />
        </div>
      )}
      <span className="absolute bottom-1.5 right-1.5 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur">
        {shot ? 'shot' : 'video'}
      </span>
    </div>
  );
}

export function ReportList({
  rows,
  empty,
}: {
  rows: ListRow[];
  empty?: React.ReactNode;
}) {
  const router = useRouter();
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
      setSel(new Set());
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!rows.length) {
    return (
      <div className="px-5 py-16 text-center text-sm text-muted-foreground">
        {empty ?? (
          <>
            Nothing here yet. Hit <kbd className="mono rounded border px-1.5 py-0.5">⌥⇧J</kbd> on
            any page to record the first one.
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Only once something is selected: an empty toolbar above every visit to
          the list would be furniture. Sticky, because the selection can happen
          at the bottom of a long grid. */}
      {sel.size > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-2 pl-3 shadow-sm">
          <span className="text-sm font-medium">
            {sel.size} selected
          </span>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
            <X /> Clear
          </Button>
          <Button size="sm" variant="destructive" className="ml-auto" onClick={remove} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Delete {sel.size === 1 ? 'ReKod' : 'ReKods'}
          </Button>
          {err ? (
            <p role="alert" className="w-full text-xs text-destructive">
              {err}
            </p>
          ) : null}
        </div>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const on = sel.has(r.id);
          return (
            // The checkbox is a SIBLING of the link, not a child: an <a> may
            // not contain another control, and nesting one made the whole card
            // navigate on every click of it.
            <li key={r.id} className="group relative">
              <Link
                href={`/reports/${r.id}`}
                className={cn(
                  'block space-y-2.5 rounded-lg border bg-card p-2.5 transition-colors hover:border-jam-deep/60',
                  on && 'border-jam-deep ring-2 ring-jam-deep/30',
                )}
              >
                <Thumb row={r} />
                <div className="space-y-1.5 px-0.5 pb-0.5">
                  {/* Only when there is one. A title is optional and filled in
                      later on the report page, so an untitled card stays as it
                      was rather than rendering a placeholder. */}
                  {r.title ? (
                    <p className="truncate text-sm font-medium">{r.title}</p>
                  ) : null}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="mono truncate text-muted-foreground">{r.project ?? '—'}</span>
                    {/* Rendered on the server and again here a moment later, so
                        "just now" can disagree with itself for one tick. */}
                    <span className="mono shrink-0 text-muted-foreground" suppressHydrationWarning>
                      {ago(r.created_at)}
                    </span>
                  </div>
                </div>
              </Link>

              <label
                // Out of the way until you want it: hidden on a resting card,
                // shown on hover and whenever it holds focus, so it is still
                // reachable by keyboard.
                className={cn(
                  'absolute left-4 top-4 z-10 grid size-6 cursor-pointer place-items-center rounded-md border bg-background/85 backdrop-blur transition-opacity',
                  !on && 'opacity-0 focus-within:opacity-100 group-hover:opacity-100',
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(r.id)}
                  aria-label={`Select the ReKod from ${r.project ?? 'an unknown project'}`}
                  className="size-3.5 accent-jam-deep"
                />
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
