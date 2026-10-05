import { PanelFrame } from '@/components/shell/panel-frame';

export default function SharedNotFound() {
  return (
    <PanelFrame className="items-center justify-center p-4">
      <div className="max-w-md space-y-3 border bg-panel px-[26px] py-6">
        <h2 className="text-xl">This link is not active</h2>
        <p className="text-muted-foreground">It was revoked, or never existed. Ask whoever sent it for a fresh one.</p>
      </div>
    </PanelFrame>
  );
}
