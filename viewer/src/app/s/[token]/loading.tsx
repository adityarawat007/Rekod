import { Skeleton } from '@/components/ui/skeleton';
import { ReportViewSkeleton } from '@/components/skeletons';

export default function SharedReportLoading() {
  return (
    <main className="flex flex-col xl:h-svh xl:overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-3 md:px-8">
        <Skeleton className="h-3.5 w-64" />
        <Skeleton className="h-6 w-40 rounded-full" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-6 md:p-8">
        <ReportViewSkeleton />
      </div>
    </main>
  );
}
