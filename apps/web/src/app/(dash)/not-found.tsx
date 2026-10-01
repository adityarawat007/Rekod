import Link from 'next/link';
import { FileQuestion, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PanelFrame } from '@/components/shell/panel-frame';

export default function DashNotFound() {
  return (
    <PanelFrame className="items-center justify-center gap-3 p-6 text-center">
      <span className="grid size-10 place-items-center rounded-xl bg-muted">
        <FileQuestion className="size-5 text-muted-foreground" />
      </span>
      <p className="font-medium">This Rekod doesn&apos;t exist, or isn&apos;t in this workspace.</p>
      <Button render={<Link href="/" />}>
        <LayoutGrid /> All Rekods
      </Button>
    </PanelFrame>
  );
}
