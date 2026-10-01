import { Skeleton } from '@/components/ui/skeleton';
import { PanelFrame } from '@/components/shell/panel-frame';

/** The grid both the cards and their skeleton lay out on. */
export const GRID = 'grid gap-x-6 gap-y-8 sm:grid-cols-2 xl:grid-cols-3 xl:gap-x-8 xl:gap-y-10';

/** Each mirrors the padding and row heights of what replaces it. */

export function PageHeaderSkeleton() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b px-6 py-4 md:px-8">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-9 w-full sm:w-72" />
    </div>
  );
}

export function ReportGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <ul className={GRID}>
      {Array.from({ length: cards }, (_, i) => (
        <li key={i} className="space-y-3">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <div className="flex justify-between px-1">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-12" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** ReportView's shape. */
export function ReportViewSkeleton() {
  return (
    <PanelFrame className="xl:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex h-16 items-center gap-2 border-b px-4">
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="ml-auto h-9 w-32 rounded-lg" />
          </div>
          <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
            <Skeleton className="aspect-video w-full rounded-2xl" />
            <Skeleton className="h-8 w-[50%]" />
            <Skeleton className="h-4 w-[35%]" />
          </div>
        </div>
        <div className="h-[80svh] border-t xl:h-auto xl:w-[min(44%,720px)] xl:border-l xl:border-t-0">
          <div className="flex h-16 items-center justify-between border-b px-4">
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="size-9 rounded-lg" />
          </div>
          <div className="flex h-11 items-center gap-6 border-b px-4">
            {[40, 64, 64, 48].map((w, i) => <Skeleton key={i} className="h-4" style={{ width: w }} />)}
          </div>
        </div>
    </PanelFrame>
  );
}
