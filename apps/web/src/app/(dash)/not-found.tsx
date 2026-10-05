import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PanelFrame } from '@/components/shell/panel-frame';

export default function DashNotFound() {
  return (
    <PanelFrame className="items-center justify-center p-4">
      {/* §6.16: text only, in a panel. */}
      <div className="max-w-md space-y-3 border bg-panel px-[26px] py-6">
        <h2 className="text-xl">Rekod not found</h2>
        <p className="text-muted-foreground">It was deleted, or it belongs to another workspace. Switch workspace and try again.</p>
        <Button render={<Link href="/rekod" />}>Back to rekods</Button>
      </div>
    </PanelFrame>
  );
}
