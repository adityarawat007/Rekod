import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sharedReport } from '@/lib/server/reports';
import { ReportView } from '@/components/report-view';
import { Brand } from '@/components/brand';
import { Comments } from '@/components/report-notes';
import { timeline, type Entry, type Env, type NetEntry } from '@/lib/types';

/** The whole anonymous surface: exact match on the token, explicit columns
 *  (see sharedReport). cache()d on primitives so generateMetadata and the page
 *  share one read. `withLogs` false is ?view=media — no log files fetched. */
const getShared = cache((token: string, withLogs: boolean) => sharedReport(token, withLogs));

export async function generateMetadata(props: PageProps<'/s/[token]'>) {
  const { token } = await props.params;
  const { view } = await props.searchParams;
  const report = await getShared(token, view !== 'media');
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
  const report = await getShared(token, view !== 'media');
  if (!report) notFound();

  return (
    // Same two-column shape as the owner's page — see (dash)/reports/[id].
    <main className="flex flex-col xl:h-svh xl:overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b px-6 py-3 md:px-8">
        {/* The same mark the dashboard wears. A recipient may never have seen
            this product before — a wordmark in bold text was the one place it
            introduced itself without showing its face. */}
        <Brand />
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
          Shared report · read only
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col p-6 md:p-8">
        <ReportView
          entries={timeline({ logs: report.logs as Entry[], network: report.network as NetEntry[] })}
          t0={report.t0}
          env={report.env as Env}
          media={report.media}
          info={{ project: report.project, pageUrl: report.pageUrl, createdAt: report.createdAt }}
          showLog={view !== 'media'}
        >
          {/* The same column the owner writes in, rendered flat: a share link
              is read-only, and no action here accepts a token. */}
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
          <Comments id={report.id} comments={report.comments} readOnly />
        </ReportView>
      </div>
    </main>
  );
}
