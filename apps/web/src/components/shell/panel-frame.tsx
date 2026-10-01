import { cn } from '@/lib/utils';

/** The white panel on the sidebar grey, for pages that have no sidebar. On xl
 *  it owns the viewport, so its children can scroll inside it. */
export function PanelFrame({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-sidebar md:p-2 xl:h-svh">
      <div
        className={cn(
          'flex min-h-svh flex-col overflow-hidden bg-background md:min-h-[calc(100svh-1rem)] md:rounded-xl md:border xl:h-full xl:min-h-0',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
