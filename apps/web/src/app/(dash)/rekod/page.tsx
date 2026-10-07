import { Suspense } from 'react';
import Link from 'next/link';
import { REPORT_TYPES, type ReportType } from '@/lib/server/reports';
import { reportPage, type Page } from './rows';
import { NewReportButton } from '@/components/home/new-report-button';
import { ReportFilters } from '@/components/home/report-filters';
import { ReportList } from '@/components/home/report-list';
import { ReportGridSkeleton } from '@/components/skeletons';

type Search = Awaited<PageProps<'/rekod'>['searchParams']>;
const one = (sp: Search, k: string) =>
  (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

export default async function Home(props: PageProps<'/rekod'>) {
  const sp = await props.searchParams;
  const q = one(sp, 'q');
  const project = one(sp, 'project') || undefined;
  const raw = sp.type;
  const types = REPORT_TYPES.filter((t) => (Array.isArray(raw) ? raw : [raw]).includes(t));
  const filtered = !!q || !!project || types.length > 0;

  const page = reportPage({ q, project, types });

  // Keyed on the query, so a new search shows the skeleton again.
  const key = `${q ?? ''}|${project ?? ''}|${types.join()}`;

  return (
    <div className="space-y-7 p-4 narrow:p-7">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <Suspense fallback={<div className="h-[38px] flex-1" />}>
          <ReportFilters />
        </Suspense>
        <NewReportButton />
      </div>

      <Suspense key={key} fallback={<ReportGridSkeleton />}>
        <Grid page={page} q={q} project={project} types={types} filtered={filtered} />
      </Suspense>
    </div>
  );
}

async function Grid({ page, q, project, types, filtered }: { page: Promise<Page>; q?: string; project?: string; types: ReportType[]; filtered: boolean }) {
  const { rows, next } = await page;
  return (
    <ReportList
      rows={rows}
      next={next}
      query={{ q, project, types }}
      empty={
        filtered ? (
          <>
            <h2 className="text-xl">No rekods match these filters.</h2>
            <p className="text-muted-foreground">{q ? `Nothing has “${q}” in its title or description.` : project ? `Nothing recorded on ${project} matches.` : 'Try another type.'}</p>
            <Link href="/rekod" className="mono inline-flex h-8 items-center text-[12.5px] font-medium text-ink underline underline-offset-4 hover:text-primary">
              Clear filters
            </Link>
          </>
        ) : undefined
      }
    />
  );
}
