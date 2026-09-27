import { cache } from 'react';
import { notFound } from 'next/navigation';
import { requireActor } from '@/lib/server/session';
import { getReport as fetchReport } from '@/lib/server/reports';
import { ReportHeader } from '@/components/report-header';
import { ReportView } from '@/components/report-view';
import { Comments, ReportNotes } from '@/components/report-notes';
import { navData } from '@/components/sidebar-nav';
import { timeline, type Entry, type Env, type NetEntry } from '@/lib/types';
import { ago } from '@/lib/format';

/** generateMetadata and the page both want the row. cache() keyed on the id —
 *  a primitive, so it actually hits — makes that one query, not two. */
const getReport = cache(async (id: string) => {
  const { workspaceId } = await requireActor();
  return fetchReport(workspaceId, id);
});

export async function generateMetadata(props: PageProps<'/reports/[id]'>) {
  const { id } = await props.params;
  const report = await getReport(id);
  // A title is optional now, and '' is not a page title.
  return { title: report?.title || 'Report' };
}

export default async function ReportPage(props: PageProps<'/reports/[id]'>) {
  const { id } = await props.params;
  const report = await getReport(id);
  if (!report) notFound();

  // navData() is cache()d and the layout already ran it, so the signed-in
  // email costs nothing here.
  const { email } = await navData();

  return (
    // The page owns the viewport on a wide screen: the header is a bar, the
    // two columns below it split what is left and scroll separately.
    <div className="flex flex-col xl:h-svh xl:overflow-hidden">
      <ReportHeader id={report.id} shareToken={report.shareToken} />
      <div className="flex min-h-0 flex-1 flex-col p-6 md:p-8">
        <ReportView
          entries={timeline({ logs: report.logs as Entry[], network: report.network as NetEntry[] })}
          t0={report.t0}
          env={report.env as Env}
          media={report.media}
          info={{ project: report.project, pageUrl: report.pageUrl, createdAt: report.createdAt }}
        >
          {/* Under the player, in the scrolling column — the reference layout:
              title, description, who made it, then the thread. */}
          <ReportNotes id={report.id} title={report.title} description={report.description} />
          <p className="border-t pt-3 text-xs text-muted-foreground">
            <span className="mono">{email ?? 'you'}</span> recorded this · {ago(report.createdAt)}
          </p>
          <Comments id={report.id} comments={report.comments} />
        </ReportView>
      </div>
    </div>
  );
}
