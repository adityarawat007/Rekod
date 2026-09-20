import { Skeleton } from '@/components/ui/skeleton';

/** Loading shapes, kept next to each other so they stay in step with the real
 *  layouts. Every one mirrors the padding and row height of what replaces it —
 *  a skeleton the wrong size is a layout shift with extra steps. */

export function PageHeaderSkeleton() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b px-6 py-5 md:px-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-52" />
      </div>
    </div>
  );
}

export function ReportGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: cards }, (_, i) => (
        <li key={i} className="space-y-2.5 rounded-lg border p-2.5">
          <Skeleton className="aspect-video w-full rounded-md" />
          {/* Two lines, not three: the card lost its title. */}
          <div className="space-y-1.5 px-0.5 pb-0.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Two columns, the same heights the real thing takes: the log pane fills the
 *  viewport on xl and is a fixed slab below it. */
export function ReportViewSkeleton() {
  return (
    <div className="grid min-h-0 flex-1 gap-6 xl:grid-cols-2 xl:overflow-hidden">
      <div className="space-y-3">
        <Skeleton className="aspect-video w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-8 w-[60%]" />
        <Skeleton className="h-4 w-[40%]" />
      </div>
      <Skeleton className="h-[70svh] w-full rounded-lg xl:h-full" />
    </div>
  );
}
