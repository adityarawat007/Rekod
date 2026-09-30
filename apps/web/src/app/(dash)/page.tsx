import { Suspense } from 'react';
import { requireActor } from '@/lib/server/session';
import { listReports } from '@/lib/server/reports';
import { PageHeader } from '@/components/page-header';
import { ReportFilters } from '@/components/report-filters';
import { ReportList, type ListRow } from '@/components/report-list';
import { ReportGridSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

// Amended 29 Aug 2026: this WAS a KPI dashboard, and /reports was a separate
// inbox listing the same rows. Two screens for one job. The recordings are the
// product, so they are the home page — tiles, trend and by-project bars are
// deleted, not hidden. See PLAN.md.

type Search = Awaited<PageProps<'/'>['searchParams']>;
const one = (sp: Search, k: string) =>
  (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

export default async function Home(props: PageProps<'/'>) {
  const sp = await props.searchParams;
  const q = one(sp, 'q');
  const filtered = !!q;

  // Started here, awaited in two places. One query feeds both the count and the
  // grid, and neither this component nor the page shell waits for it.
  const rows = search(q);

  // Keying the boundary on the query means a new search shows the skeleton
  // again, instead of leaving stale cards up with no sign anything happened.
  const key = q ?? '';

  return (
    <>
      <PageHeader
        title="Your ReKods"
        sub={
          <Suspense key={key} fallback={<Skeleton className="h-4 w-24" />}>
            <ResultCount rows={rows} filtered={filtered} />
          </Suspense>
        }
      />
      <div className="space-y-4 p-6 md:p-8">
        <Suspense fallback={<Skeleton className="h-9 w-full" />}>
          <ReportFilters />
        </Suspense>

        <Suspense key={key} fallback={<ReportGridSkeleton />}>
          <Grid rows={rows} filtered={filtered} />
        </Suspense>
      </div>
    </>
  );
}

async function ResultCount({ rows, filtered }: { rows: Promise<ListRow[]>; filtered: boolean }) {
  const n = (await rows).length;
  return `${n} ReKod${n === 1 ? '' : 's'}${filtered ? ' matching' : ''}`;
}

async function Grid({ rows, filtered }: { rows: Promise<ListRow[]>; filtered: boolean }) {
  const list = await rows;
  return (
    <ReportList
      rows={list}
      empty={filtered ? 'No ReKods match this search.' : undefined}
    />
  );
}

async function search(q: string | undefined): Promise<ListRow[]> {
  const { workspaceId } = await requireActor();
  // Title and description both, because a title is optional and plenty of
  // recordings only ever have the write-up.
  const rows = await listReports(workspaceId, { q });
  return rows.map((r) => ({
    id: r.id, title: r.title, project: r.project, created_at: r.createdAt.toISOString(),
    shot: r.type === 'screenshot', preview: r.preview,
  }));
}
