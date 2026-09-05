import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { StatusSelect } from '@/components/status-select';
import { ShareButton } from '@/components/share-button';
import type { Report } from '@/lib/types';

export function ReportHeader({ report }: { report: Report }) {
  return (
    <div className="border-b px-6 py-5 md:px-8">
      <Link
        href="/"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Recordings
      </Link>
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
        <div className="flex items-center gap-2">
          <ShareButton
            id={report.id}
            videoPath={report.video_path}
            shareToken={report.share_token}
          />
          <StatusSelect id={report.id} status={report.status} />
        </div>
      </div>
    </div>
  );
}
