import Link from 'next/link';
import { House, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShareButton } from '@/components/report/share-button';
import { ReportMenu } from '@/components/report/menu';

/** Page, project, clock and machine live in the Info tab, not here. */
export function ReportHeader({ id, shareToken }: { id: string; shareToken: string | null }) {
  return (
    <>
      <Button variant="outline" size="icon" aria-label="Home" render={<Link href="/" />}>
        <House />
      </Button>
      <Button variant="ghost" className="text-[15px] text-muted-foreground" render={<Link href="/" />}>
        <LayoutGrid /> All Rekods
      </Button>
      <ReportMenu id={id} />
      <div className="ml-auto">
        <ShareButton id={id} shareToken={shareToken} />
      </div>
    </>
  );
}
