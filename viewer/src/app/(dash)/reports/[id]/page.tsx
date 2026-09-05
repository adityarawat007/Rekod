import { cache } from 'react';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { ReportHeader } from '@/components/report-header';
import { ReportView } from '@/components/report-view';
import { isScreenshot, timeline, type Report } from '@/lib/types';

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
  return { title: report?.title ?? 'Report' };
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

  return (
    <>
      <ReportHeader report={report} />
      <div className="p-6 md:p-8">
        <ReportView
          entries={timeline(report)}
          t0={report.t0}
          env={report.env ?? {}}
          media={media}
        />
      </div>
    </>
  );
}
