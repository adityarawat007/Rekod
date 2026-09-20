import Link from 'next/link';
import { AlertTriangle, Camera, Video } from 'lucide-react';
import { ago } from '@/lib/format';
import { isScreenshot } from '@/lib/types';

export type ListRow = {
  id: string;
  title: string;
  project: string | null;
  created_at: string;
  video_path: string | null;
  error_count: number | null;
  failed_count: number | null;
};

function Signal({ errors, failed }: { errors: number; failed: number }) {
  if (!errors && !failed) return <span className="text-muted-foreground">clean</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-crit">
      <AlertTriangle className="size-3.5" aria-hidden />
      <span className="mono">
        {errors > 0 && `${errors} err`}
        {errors > 0 && failed > 0 && ' · '}
        {failed > 0 && `${failed} failed`}
      </span>
    </span>
  );
}

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
function Thumb({ row, url }: { row: ListRow; url?: string }) {
  const shot = isScreenshot(row.video_path);
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
  previews,
  empty,
}: {
  rows: ListRow[];
  /** video_path → signed URL. Missing entries fall back to an icon. */
  previews?: Map<string, string>;
  empty?: React.ReactNode;
}) {
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
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => (
        <li key={r.id}>
          <Link
            href={`/reports/${r.id}`}
            className="block space-y-2.5 rounded-lg border bg-card p-2.5 transition-colors hover:border-jam/60"
          >
            <Thumb row={r} url={r.video_path ? previews?.get(r.video_path) : undefined} />
            <div className="space-y-1.5 px-0.5 pb-0.5">
              <p className="truncate font-medium leading-snug">{r.title}</p>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="mono truncate text-muted-foreground">{r.project ?? '—'}</span>
                <span className="mono shrink-0 text-muted-foreground">{ago(r.created_at)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <Signal errors={r.error_count ?? 0} failed={r.failed_count ?? 0} />
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
