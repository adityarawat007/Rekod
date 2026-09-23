import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { ReportView } from '@/components/report-view';
import { Comments } from '@/components/report-notes';
import { isScreenshot, timeline, type SharedReport } from '@/lib/types';

// A share token is the credential, so a token that looks nothing like one is
// not worth a database round trip — and passing junk to a uuid parameter is a
// 22P02 error, not an empty result.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The whole anonymous surface: one security definer function, exact match on
 *  the token. cache()d on a primitive so generateMetadata and the page share
 *  one call. */
const getShared = cache(async (token: string): Promise<SharedReport | null> => {
  if (!UUID.test(token)) return null;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('shared_report', { token }).maybeSingle();
  // A revoked token and a broken query are different things: the first is a
  // 404, the second should reach error.tsx rather than masquerade as one.
  if (error) throw new Error(error.message);
  return (data as SharedReport | null) ?? null;
});

export async function generateMetadata(props: PageProps<'/s/[token]'>) {
  const { token } = await props.params;
  const report = await getShared(token);
  if (!report) return { title: 'Link not found', robots: { index: false } };

  const title = `${report.title || 'Untitled ReKod'} · ReKod`;
  return {
    title,
    description: `Bug report from ${report.project ?? 'an unknown project'}, captured with console and network log.`,
    // Shared reports carry customer traffic and internal URLs. They must never
    // be indexed, whatever the recipient's crawler thinks.
    robots: { index: false, follow: false },
    openGraph: { title, type: 'article' },
  };
}

export default async function SharedReportPage(props: PageProps<'/s/[token]'>) {
  const { token } = await props.params;
  // ?view=media is the "video only" share: same report, no log pane. Anything
  // else, including nothing, is the full view.
  const { view } = await props.searchParams;
  const report = await getShared(token);
  if (!report) notFound();

  // Signed by the owner when they created the link — this page has no session
  // and could never sign it. Null means the report was filed without media.
  const media = report.share_url
    ? { url: report.share_url, kind: isScreenshot(report.video_path) ? 'shot' as const : 'video' as const }
    : null;

  return (
    // Same two-column shape as the owner's page — see (dash)/reports/[id].
    <main className="flex flex-col xl:h-svh xl:overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b px-6 py-3 md:px-8">
        <Link href="/" className="font-heading text-sm font-extrabold hover:underline">
          ReKod
        </Link>
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
          Shared report · read only
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col p-6 md:p-8">
        <ReportView
          entries={timeline(report)}
          t0={report.t0}
          env={report.env ?? {}}
          media={media}
          info={{ project: report.project, pageUrl: report.page_url, createdAt: report.created_at }}
          showLog={view !== 'media'}
        >
          {/* The same column the owner writes in, rendered flat: `anon` has no
              write grant and gets no function that posts. */}
          <h1 className="font-heading text-2xl font-extrabold leading-tight">
            {report.title || 'Untitled ReKod'}
          </h1>
          {report.description ? (
            <p className="max-w-prose whitespace-pre-wrap text-sm text-muted-foreground">
              {report.description}
            </p>
          ) : null}
          <p className="border-t pt-3 text-xs text-muted-foreground">
            Captured with{' '}
            <Link href="/" className="font-heading font-extrabold text-foreground hover:underline">
              ReKod
            </Link>{' '}
            — the console and network log were redacted in the browser before upload.
          </p>
          <Comments id={report.id} comments={report.comments ?? []} readOnly />
        </ReportView>
      </div>
    </main>
  );
}
