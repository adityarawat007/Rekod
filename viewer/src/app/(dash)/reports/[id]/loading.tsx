import { Skeleton } from '@/components/ui/skeleton';
import { ReportViewSkeleton } from '@/components/skeletons';

export default function ReportLoading() {
  return (
    <>
      <div className="space-y-3 border-b px-6 py-5 md:px-8">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-7 w-[min(32rem,80%)]" />
        <Skeleton className="h-3.5 w-64" />
      </div>
      <div className="p-6 md:p-8">
        <ReportViewSkeleton />
      </div>
    </>
  );
}
