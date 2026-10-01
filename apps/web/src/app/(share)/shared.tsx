import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sharedReport } from '@/lib/server/reports';
import { ReportView } from '@/components/report/view';
import { Brand } from '@/components/shell/brand';
import { Comments } from '@/components/report/notes';
import { timeline, type Entry, type Env, type NetEntry } from '@/lib/types';

/** The whole anonymous surface (see sharedReport). /c/ is the full view, /v/
 *  the video only — and /v/ never fetches the log files. The two paths are a
 *  render choice on one token, not two permissions: anyone holding /v/ can
 *  type /c/. */
const getShared = cache((token: string, withLogs: boolean) => sharedReport(token, withLogs));

export async function sharedMetadata(token: string, withLogs: boolean) {
  const report = await getShared(token, withLogs);
  if (!report) return { title: 'Link not found', robots: { index: false } };

  const title = `${report.title || 'Untitled Rekod'} · Rekod`;
  return {
    title,
    description: `Bug report from ${report.project ?? 'an unknown project'}, captured with console and network log.`,
    // They carry customer traffic and internal URLs: never index.
    robots: { index: false, follow: false },
    openGraph: { title, type: 'article' as const },
  };
}

export async function SharedReport({ token, withLogs }: { token: string; withLogs: boolean }) {
  const report = await getShared(token, withLogs);
  if (!report) notFound();

  return (
    <main>
      <ReportView
        toolbar={
          <>
            <Brand />
            <span className="ml-auto rounded-full border px-3 py-1 text-xs text-muted-foreground">
              Shared Rekod · read only
            </span>
          </>
        }
        entries={timeline({ logs: report.logs as Entry[], network: report.network as NetEntry[] })}
        t0={report.t0}
        env={report.env as Env}
        media={report.media}
        info={{ project: report.project, pageUrl: report.pageUrl, createdAt: report.createdAt }}
        showLog={withLogs}
      >
        {/* Read-only: no action accepts a share token. */}
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight">
            {report.title || 'Untitled Rekod'}
          </h1>
          {report.description ? (
            <p className="max-w-prose whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/80">
              {report.description}
            </p>
          ) : null}
        </div>
        <p className="border-t pt-4 text-sm text-muted-foreground">
          Captured with{' '}
          <Link href="/" className="font-medium text-foreground hover:underline">
            Rekod
          </Link>{' '}
          — the console and network log were redacted in the browser before upload.
        </p>
        <Comments id={report.id} comments={report.comments} readOnly />
      </ReportView>
    </main>
  );
}
