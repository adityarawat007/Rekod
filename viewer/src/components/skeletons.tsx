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
          <div className="space-y-1.5 px-0.5 pb-0.5">
            <Skeleton className="h-4 w-[70%]" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ReportViewSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Skeleton className="aspect-video w-full" />
      <div className="space-y-3">
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    </div>
  );
}
