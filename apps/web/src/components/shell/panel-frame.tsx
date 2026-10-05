import { cn } from '@/lib/utils';

/** The app, edge to edge on --bg. `fill` pins it to the viewport so children
 *  can scroll inside it (the report page, on xl). */
export function PanelFrame({ className, fill, children }: { className?: string; fill?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('flex min-h-svh flex-col bg-background', fill && 'wide:h-svh wide:min-h-0 wide:overflow-hidden', className)}>
      {children}
    </div>
  );
}
