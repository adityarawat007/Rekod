import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ShareButton } from '@/components/share-button';
import { DeleteReportButton } from '@/components/delete-reports';
import type { Report } from '@/lib/types';

export function ReportHeader({ report }: { report: Report }) {
  // A bar, and only a bar. The title and the description are under the player
  // where they are edited; the page, the project, the clock and the machine
  // are all in the Info tab, which is where someone reading the log is already
  // looking. Nothing is repeated here.
  return (
    <div className="flex shrink-0 items-center justify-between gap-4 border-b px-6 py-3 md:px-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Recordings
      </Link>
      <div className="flex items-center gap-2">
        <DeleteReportButton report={report} />
        <ShareButton
          id={report.id}
          videoPath={report.video_path}
          shareToken={report.share_token}
          shareUrl={report.share_url}
        />
      </div>
    </div>
  );
}
