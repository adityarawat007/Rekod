import { PageHeaderSkeleton, ReportGridSkeleton } from '@/components/skeletons';

export default function HomeLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="p-6 md:p-8">
        <ReportGridSkeleton />
      </div>
    </>
  );
}
