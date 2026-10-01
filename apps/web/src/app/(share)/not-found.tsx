import { LinkIcon } from 'lucide-react';
import { PanelFrame } from '@/components/shell/panel-frame';

export default function SharedNotFound() {
  return (
    <PanelFrame className="items-center justify-center gap-3 p-6 text-center">
      <span className="grid size-10 place-items-center rounded-xl bg-muted">
        <LinkIcon className="size-5 text-muted-foreground" />
      </span>
      <p className="font-medium">This link is not active</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        It was revoked, or never existed. Ask whoever sent it for a fresh one.
      </p>
    </PanelFrame>
  );
}
