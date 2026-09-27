import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';

export default function DashNotFound() {
  return (
    <>
      <PageHeader title="Not found" sub="That report does not exist, or it is not yours." />
      <div className="p-6 md:p-8">
        <Button render={<Link href="/" />}>Back to ReKods</Button>
      </div>
    </>
  );
}
