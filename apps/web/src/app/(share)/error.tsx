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
    <PanelFrame className="items-center justify-center p-4">
      <div className="max-w-md space-y-3 border bg-panel px-[26px] py-6">
        <h2 className="text-xl">This rekod would not load</h2>
        <p className="text-muted-foreground">The link is valid, so this is on our side. Try again in a moment.</p>
        <Button onClick={reset}>
          <RotateCw /> Try again
        </Button>
      </div>
    </PanelFrame>
  );
}
