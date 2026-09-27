import { PageHeaderSkeleton, ReportGridSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

// Swapped in the instant a link is clicked, so navigation feels immediate even
// though the query and the batch of signed preview URLs still run server-side.
export default function HomeLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="space-y-4 p-6 md:p-8">
        <Skeleton className="h-9 w-full" />
        <ReportGridSkeleton />
      </div>
    </>
  );
}
