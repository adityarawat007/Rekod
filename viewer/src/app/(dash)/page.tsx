import { Suspense } from 'react';
import { supabaseServer } from '@/lib/supabase/server';
import { navData } from '@/components/sidebar-nav';
import { previewUrls } from '@/lib/previews';
import { PageHeader } from '@/components/page-header';
import { ReportFilters } from '@/components/report-filters';
import { ReportList, type ListRow } from '@/components/report-list';
import { ReportGridSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

// Amended 29 Aug 2026: this WAS a KPI dashboard, and /reports was a separate
// inbox listing the same rows. Two screens for one job. The recordings are the
// product, so they are the home page — tiles, trend and by-project bars are
// deleted, not hidden. See PLAN.md.
const COLS = 'id,title,project,created_at,video_path,error_count,failed_count';
const FILTER_KEYS = ['project', 'failing', 'q', 'range'] as const;

type Search = Awaited<PageProps<'/'>['searchParams']>;
const one = (sp: Search, k: string) =>
  (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

export default async function Home(props: PageProps<'/'>) {
  const sp = await props.searchParams;
  const filtered = FILTER_KEYS.some((k) => one(sp, k));

  // Started here, awaited in two places. One query feeds both the count and the
  // grid, and neither this component nor the page shell waits for it.
  const rows = search(sp);

  // Keying the boundary on the query means changing a filter shows the skeleton
  // again, instead of leaving stale cards up with no sign anything happened.
  const key = FILTER_KEYS.map((k) => one(sp, k) ?? '').join(' ');

  return (
    <>
      <PageHeader
        title="Your recordings"
        sub={
          <Suspense key={key} fallback={<Skeleton className="h-4 w-24" />}>
            <ResultCount rows={rows} filtered={filtered} />
          </Suspense>
        }
      />
      <div className="space-y-4 p-6 md:p-8">
        <Suspense fallback={<Skeleton className="h-9 w-full" />}>
          <Filters />
        </Suspense>

        <Suspense key={key} fallback={<ReportGridSkeleton />}>
          <Grid rows={rows} filtered={filtered} />
        </Suspense>
      </div>
    </>
  );
}

/** The project list is the sidebar's query, already cached for this request. */
async function Filters() {
  const { projects } = await navData();
  return <ReportFilters projects={projects} />;
}

async function ResultCount({ rows, filtered }: { rows: Promise<ListRow[]>; filtered: boolean }) {
  const n = (await rows).length;
  return `${n} recording${n === 1 ? '' : 's'}${filtered ? ' matching' : ''}`;
}

async function Grid({ rows, filtered }: { rows: Promise<ListRow[]>; filtered: boolean }) {
  const list = await rows;
  return (
    <ReportList
      rows={list}
      previews={await previewUrls(list)}
      empty={filtered ? 'No recordings match these filters.' : undefined}
    />
  );
}

async function search(sp: Search): Promise<ListRow[]> {
  const supabase = await supabaseServer();
  // RLS scopes every read to the signed-in owner, so no owner filter here.
  let query = supabase
    .from('reports')
    .select(COLS)
    .order('created_at', { ascending: false })
    // ponytail: 60, not 200 — every card is a range request for a video frame.
    // Paginate when the grid outgrows one screenful of scrolling.
    .limit(60);

  const project = one(sp, 'project');
  const q = one(sp, 'q');
  const range = one(sp, 'range');

  if (project) query = query.eq('project', project);
  // PostgREST `or` on two generated int columns — cheap because they are stored.
  if (one(sp, 'failing')) query = query.or('error_count.gt.0,failed_count.gt.0');
  if (q) query = query.ilike('title', `%${q}%`);
  if (range && /^\d+$/.test(range)) {
    query = query.gte('created_at', new Date(Date.now() - Number(range) * 864e5).toISOString());
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message); // error.tsx renders it
  return (data ?? []) as ListRow[];
}
