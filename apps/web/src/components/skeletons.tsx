import { Skeleton } from '@/components/ui/skeleton';
import { PanelFrame } from '@/components/shell/panel-frame';

/** The grid both the cards and their skeleton lay out on. */
// Four across on wide screens; the first page is 16 (PAGE_SIZE), a full 4×4.
export const GRID = 'grid gap-5 sm:grid-cols-2 narrow:grid-cols-3 wide:grid-cols-4';

/** Each mirrors the padding and row heights of what replaces it. */

/** The home page under the header: summary row, filter row, grid. */
export function HomeSkeleton() {
  return (
    <div className="space-y-7 p-4 narrow:p-7">
      <div className="flex items-center justify-between gap-6">
        <Skeleton className="h-5 w-72" />
        <Skeleton className="hidden h-[38px] w-32 narrow:block" />
      </div>
      <Skeleton className="h-[38px] w-full" />
      <ReportGridSkeleton />
    </div>
  );
}

export function ReportGridSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <ul className={GRID}>
      {Array.from({ length: cards }, (_, i) => (
        <li key={i} className="border bg-panel">
          <Skeleton className="aspect-video w-full" />
          <div className="min-h-[68px] space-y-2 px-3.5 py-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** ReportView's shape. */
export function ReportViewSkeleton() {
  return (
    <PanelFrame fill className="wide:flex-row">
      <div className="min-w-0 flex-1">
        <div className="flex h-16 items-center gap-2 border-b bg-panel px-4 narrow:px-7">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="ml-auto size-[38px]" />
          <Skeleton className="h-[38px] w-36" />
        </div>
        <div className="mx-auto max-w-5xl space-y-6 p-4 narrow:p-7">
          <div className="space-y-2">
            <Skeleton className="h-7 w-[50%]" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="aspect-video w-full" />
        </div>
      </div>
      <div className="h-[80svh] border-t bg-panel wide:h-auto wide:w-[min(44%,720px)] wide:border-l wide:border-t-0">
        <div className="flex h-16 items-center gap-6 border-b px-4 narrow:px-6">
          {[40, 72, 72, 48].map((w, i) => <Skeleton key={i} className="h-4" style={{ width: w }} />)}
        </div>
      </div>
    </PanelFrame>
  );
}
