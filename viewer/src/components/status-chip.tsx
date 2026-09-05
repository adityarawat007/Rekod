import type { Status } from '@/lib/types';
import { cn } from '@/lib/utils';

// Status is a state, not a series — reserved colours, and always with the word
// next to the dot so it never reads by colour alone.
const STYLE: Record<Status, string> = {
  new: 'border-jam/30 bg-jam/10 text-jam-deep dark:text-jam',
  triaging: 'border-grape/30 bg-grape/10 text-grape',
  fixed: 'border-good/30 bg-good/10 text-good',
};

export function StatusChip({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize',
        STYLE[status],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {status}
    </span>
  );
}
