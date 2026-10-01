import { Suspense } from 'react';
import { REPORT_TYPES, type ReportType } from '@/lib/server/reports';
import { reportPage, type Page } from './rows';
import { NewReportButton } from '@/components/home/new-report-button';
import { PageHeader } from '@/components/home/page-header';
import { ReportFilters } from '@/components/home/report-filters';
import { ReportList } from '@/components/home/report-list';
import { ReportGridSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import Link from 'next/link';


type Search = Awaited<PageProps<'/'>['searchParams']>;
const one = (sp: Search, k: string) =>
  (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

export default async function Home(props: PageProps<'/'>) {
  const sp = await props.searchParams;
  const q = one(sp, 'q');
  const raw = sp.type;
  const types = REPORT_TYPES.filter((t) => (Array.isArray(raw) ? raw : [raw]).includes(t));
  const filtered = !!q || types.length > 0;

  const page = reportPage({ q, types });

  // Keyed on the query, so a new search shows the skeleton again.
  const key = `${q ?? ''}|${types.join()}`;

  return (
    <>
      <PageHeader
        title="All Rekods"
      >
        <NewReportButton />
      </PageHeader>
      <div className="space-y-6 p-6 md:p-8">
        <Suspense fallback={<Skeleton className="h-9 w-full" />}>
          <ReportFilters />
        </Suspense>
        <Suspense key={key} fallback={<ReportGridSkeleton />}>
          <Grid page={page} q={q} types={types} filtered={filtered} />
        </Suspense>
      </div>
    </>
  );
}

async function Grid({ page, q, types, filtered }: { page: Promise<Page>; q?: string; types: ReportType[]; filtered: boolean }) {
  const { rows, next } = await page;
  return (
    <ReportList
      rows={rows}
      next={next}
      query={{ q, types }}
      empty={filtered ? (
        <>
          <p className="text-sm font-medium">{q ? `No Rekods match “${q}”` : 'No Rekods of this type'}</p>
          <Button variant="outline" size="sm" render={<Link href="/" />}>Clear filters</Button>
        </>
      ) : undefined}
    />
  );
}
