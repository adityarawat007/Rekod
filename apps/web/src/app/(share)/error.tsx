'use client';

import { useEffect } from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PanelFrame } from '@/components/shell/panel-frame';

// Not the dashboard's: its links send a recipient with no account to /login.
export default function SharedError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PanelFrame className="items-center justify-center gap-3 p-6 text-center">
      <p className="font-medium">This Rekod would not load</p>
      <p className="max-w-xs text-sm text-muted-foreground">The link is valid, so this is on our side.</p>
      <Button onClick={reset}>
        <RotateCw /> Try again
      </Button>
    </PanelFrame>
  );
}
