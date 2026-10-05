import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ShareButton } from '@/components/report/share-button';
import { ReportMenu } from '@/components/report/menu';

/** Page, project, clock and machine live in the Info tab, not here. */
export function ReportHeader({ id, shareToken }: { id: string; shareToken: string | null }) {
  return (
    <>
      <Link
        href="/rekod"
        className="-ml-2 flex h-[38px] items-center gap-1.5 px-2 font-medium text-muted-foreground transition-colors duration-150 hover:bg-bg hover:text-ink"
      >
        <ArrowLeft className="size-4" /> All rekods
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <ReportMenu id={id} />
        <ShareButton id={id} shareToken={shareToken} />
      </div>
    </>
  );
}
