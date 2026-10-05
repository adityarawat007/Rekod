import { cache } from 'react';
import { notFound } from 'next/navigation';
import { requireActor } from '@/lib/server/session';
import { getReport as fetchReport } from '@/lib/server/reports';
import { ReportHeader } from '@/components/report/header';
import { ReportView } from '@/components/report/view';
import { Comments, ReportNotes } from '@/components/report/notes';
import { timeline, type Entry, type Env, type NetEntry } from '@/lib/types';
import { ago, urlParts } from '@/lib/format';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/** Keyed on a primitive so generateMetadata and the page share one query. */
const getReport = cache(async (id: string) => {
  const { workspaceId } = await requireActor();
  return fetchReport(workspaceId, id);
});

export async function generateMetadata(props: PageProps<'/reports/[id]'>) {
  const { id } = await props.params;
  const report = await getReport(id);
  return { title: report?.title || 'Rekod' };
}

export default async function ReportPage(props: PageProps<'/reports/[id]'>) {
  const { id } = await props.params;
  const report = await getReport(id);
  if (!report) notFound();

  const by = report.creator;

  return (
    <ReportView
      toolbar={<ReportHeader id={report.id} shareToken={report.shareToken} />}
      entries={timeline({ logs: report.logs as Entry[], network: report.network as NetEntry[] })}
      t0={report.t0}
      env={report.env as Env}
      media={report.media}
      info={{ project: report.project, pageUrl: report.pageUrl, createdAt: report.createdAt }}
      heading={
        <ReportNotes
          id={report.id}
          title={report.title}
          description={report.description}
          host={hostOf(report.pageUrl ?? (report.env as Env)?.url)}
        />
      }
    >
      <p className="flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
        <Avatar className="size-6">
          {by?.image ? <AvatarImage src={by.image} alt="" referrerPolicy="no-referrer" /> : null}
          <AvatarFallback className="bg-cell text-[10px] font-semibold text-ink">
            {(by?.name || by?.email || '?')[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span>
          <span className="font-medium text-foreground">{by?.name || by?.email || 'Someone'}</span> recorded this
          via the Chrome extension · <span className="mono text-xs">{ago(report.createdAt)}</span>
        </span>
      </p>
      <Comments id={report.id} comments={report.comments} />
    </ReportView>
  );
}

const hostOf = (u?: string | null) => (u ? urlParts(u).host || null : null);
