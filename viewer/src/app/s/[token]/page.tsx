import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase/server';
import { ReportView } from '@/components/report-view';
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

  const title = `${report.title} · FlamJam`;
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
  const report = await getShared(token);
  if (!report) notFound();

  // Signed by the owner when they created the link — this page has no session
  // and could never sign it. Null means the report was filed without media.
  const media = report.share_url
    ? { url: report.share_url, kind: isScreenshot(report.video_path) ? 'shot' as const : 'video' as const }
    : null;

  return (
    <main className="min-h-dvh">
      <header className="border-b px-6 py-5 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-extrabold leading-tight">{report.title}</h1>
            <p className="mono mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{report.project ?? '—'}</span>
              <span aria-hidden>·</span>
              <span>{new Date(report.created_at).toLocaleString()}</span>
              {report.page_url ? (
                <>
                  <span aria-hidden>·</span>
                  <a
                    href={report.page_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-grape hover:underline"
                  >
                    open page <ExternalLink className="size-3" />
                  </a>
                </>
              ) : null}
            </p>
          </div>
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            Shared report · read only
          </span>
        </div>
      </header>

      <div className="p-6 md:p-8">
        <ReportView
          entries={timeline(report)}
          t0={report.t0}
          env={report.env ?? {}}
          media={media}
        />
      </div>

      <footer className="border-t px-6 py-5 text-sm text-muted-foreground md:px-8">
        Captured with{' '}
        <Link href="/" className="font-heading font-extrabold text-foreground hover:underline">
          FlamJam
        </Link>{' '}
        — the console and network log were redacted in the browser before upload.
      </footer>
    </main>
  );
}
