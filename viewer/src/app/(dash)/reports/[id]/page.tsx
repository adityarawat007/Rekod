import { cache } from 'react';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { ReportHeader } from '@/components/report-header';
import { ReportView } from '@/components/report-view';
import { Comments, ReportNotes } from '@/components/report-notes';
import { navData } from '@/components/sidebar-nav';
import { isScreenshot, timeline, type Report } from '@/lib/types';
import { ago } from '@/lib/format';

/** generateMetadata and the page both want the row. cache() keyed on the id —
 *  a primitive, so it actually hits — makes that one query, not two. */
const getReport = cache(async (id: string) => {
  const supabase = await supabaseServer();
  const { data } = await supabase.from('reports').select('*').eq('id', id).maybeSingle();
  return (data ?? null) as Report | null;
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

  // Signed with the reader's own session — `authenticated` may select from the
  // bucket, so no service_role key is involved on this path either. Dependent on
  // video_path, so it cannot be hoisted into the query above; loading.tsx covers
  // the wait.
  let media: { url: string; kind: 'video' | 'shot' } | null = null;
  if (report.video_path) {
    const supabase = await supabaseServer();
    const { data: signed } = await supabase.storage
      .from('reports')
      .createSignedUrl(report.video_path, 3600);
    if (signed?.signedUrl) {
      media = { url: signed.signedUrl, kind: isScreenshot(report.video_path) ? 'shot' : 'video' };
    }
  }

  // navData() is cache()d and the layout already ran it, so the signed-in
  // email costs nothing here.
  const { email } = await navData();

  return (
    // The page owns the viewport on a wide screen: the header is a bar, the
    // two columns below it split what is left and scroll separately.
    <div className="flex flex-col xl:h-svh xl:overflow-hidden">
      <ReportHeader report={report} />
      <div className="flex min-h-0 flex-1 flex-col p-6 md:p-8">
        <ReportView
          entries={timeline(report)}
          t0={report.t0}
          env={report.env ?? {}}
          media={media}
          info={{ project: report.project, pageUrl: report.page_url, createdAt: report.created_at }}
        >
          {/* Under the player, in the scrolling column — the reference layout:
              title, description, who made it, then the thread. */}
          <ReportNotes id={report.id} title={report.title} description={report.description} />
          <p className="border-t pt-3 text-xs text-muted-foreground">
            <span className="mono">{email ?? 'you'}</span> recorded this · {ago(report.created_at)}
          </p>
          <Comments id={report.id} comments={report.comments ?? []} author={email} />
        </ReportView>
      </div>
    </div>
  );
}
