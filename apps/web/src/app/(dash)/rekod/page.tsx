import { Suspense } from 'react';
import Link from 'next/link';
import { REPORT_TYPES, type ReportType } from '@/lib/server/reports';
import { reportCounts, reportPage, type Counts, type Page } from './rows';
import { NewReportButton } from '@/components/home/new-report-button';
import { ReportFilters } from '@/components/home/report-filters';
import { ReportList } from '@/components/home/report-list';
import { ReportGridSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

type Search = Awaited<PageProps<'/rekod'>['searchParams']>;
const one = (sp: Search, k: string) =>
  (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

const n = (x: number) => x.toLocaleString('en');
const plural = (x: number, one: string, many = `${one}s`) => `${n(x)} ${x === 1 ? one : many}`;

export default async function Home(props: PageProps<'/rekod'>) {
  const sp = await props.searchParams;
  const q = one(sp, 'q');
  const raw = sp.type;
  const types = REPORT_TYPES.filter((t) => (Array.isArray(raw) ? raw : [raw]).includes(t));
  const filtered = !!q || types.length > 0;

  // One promise each, shared by every child that needs it.
  const page = reportPage({ q, types });
  const counts = reportCounts({ q, types });

  // Keyed on the query, so a new search shows the skeleton again.
  const key = `${q ?? ''}|${types.join()}`;

  return (
    <div className="space-y-7 p-4 narrow:p-7">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <Suspense fallback={<Skeleton className="h-5 w-72" />}>
          <Summary counts={counts} />
        </Suspense>
        <NewReportButton />
      </div>

      <Suspense fallback={<Skeleton className="h-[38px] w-full" />}>
        <ReportFilters
          counter={
            <Suspense key={key} fallback={<Skeleton className="h-8 w-48" />}>
              <MatchCounter counts={counts} filtered={filtered} />
            </Suspense>
          }
        />
      </Suspense>

      <Suspense key={key} fallback={<ReportGridSkeleton />}>
        <Grid page={page} q={q} types={types} filtered={filtered} />
      </Suspense>
    </div>
  );
}

/** "27 rekods · 21 videos · 6 screenshots", counts in --ink. */
async function Summary({ counts }: { counts: Promise<Counts> }) {
  const c = await counts;
  return (
    <p className="text-muted-foreground">
      <b className="font-medium text-ink">{n(c.total)}</b> {c.total === 1 ? 'rekod' : 'rekods'} captured
      <span aria-hidden> · </span>
      <span className="inline-flex items-center gap-1.5">
        <i aria-hidden className="size-2.5 rounded-full bg-open" />
        <b className="font-medium text-ink">{n(c.videos)}</b> {c.videos === 1 ? 'video' : 'videos'}
      </span>
      <span aria-hidden> · </span>
      <span className="inline-flex items-center gap-1.5">
        <i aria-hidden className="size-2.5 rounded-full border-[1.5px] border-open" />
        <b className="font-medium text-ink">{n(c.shots)}</b> {c.shots === 1 ? 'screenshot' : 'screenshots'}
      </span>
    </p>
  );
}

/** §6.3: "13 of 27 rekods match", the number in `stat`. */
async function MatchCounter({ counts, filtered }: { counts: Promise<Counts>; filtered: boolean }) {
  const c = await counts;
  return (
    <p className="text-muted-foreground" aria-live="polite">
      <span className="stat mr-1.5 text-ink">{n(filtered ? c.match : c.total)}</span>
      {filtered ? `of ${plural(c.total, 'rekod')} match` : c.total === 1 ? 'rekod' : 'rekods'}
    </p>
  );
}

async function Grid({ page, q, types, filtered }: { page: Promise<Page>; q?: string; types: ReportType[]; filtered: boolean }) {
  const { rows, next } = await page;
  return (
    <ReportList
      rows={rows}
      next={next}
      query={{ q, types }}
      empty={
        filtered ? (
          <>
            <h2 className="text-xl">No rekods match these filters.</h2>
            <p className="text-muted-foreground">{q ? `Nothing has “${q}” in its title or description.` : 'Try another type.'}</p>
            <Link href="/rekod" className="mono inline-flex h-8 items-center text-[12.5px] font-medium text-ink underline underline-offset-4 hover:text-primary">
              Clear filters
            </Link>
          </>
        ) : undefined
      }
    />
  );
}
