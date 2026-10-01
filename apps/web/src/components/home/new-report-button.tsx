'use client';

import { Camera, Plus, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Shortcut } from '@/components/home/shortcut';

function Row({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2">
      <span className="grid size-8 place-items-center rounded-lg bg-muted">
        <Icon className="size-4" />
      </span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

/** Shows how to start one: a page cannot reach the extension. */
export function NewReportButton() {
  return (
    <Popover>
      <PopoverTrigger render={<Button className="hidden md:inline-flex" />}>
        <Plus /> New Rekod
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-1 p-2">
        <Row icon={Video} label="Record tab">
          <Shortcut small />
        </Row>
        <Row icon={Camera} label="Screenshot">
          <span className="text-xs text-muted-foreground">toolbar icon</span>
        </Row>
        <p className="border-t px-2 pb-1 pt-2.5 text-xs text-muted-foreground">
          Starts from the extension, on the tab you want.
        </p>
      </PopoverContent>
    </Popover>
  );
}
