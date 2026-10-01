import { ArrowBigUp, Option } from 'lucide-react';
import { cn } from '@/lib/utils';

function Key({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <kbd
      className={cn(
        'grid place-items-center rounded-lg border border-b-2 bg-background font-semibold shadow-[0_1px_0_rgba(0,0,0,.04)]',
        small ? 'size-7 text-[13px] [&_svg]:size-3.5' : 'size-9 text-[15px] [&_svg]:size-4',
      )}
    >
      {children}
    </kbd>
  );
}

/** ⌥⇧J as keycaps — the extension's one hotkey. Icons, not glyphs: ⇧ falls
 *  back to a half-size glyph in Inter. */
export function Shortcut({ small }: { small?: boolean }) {
  return (
    <span className="flex gap-1" aria-label="Option Shift J">
      <Key small={small}><Option /></Key>
      <Key small={small}><ArrowBigUp /></Key>
      <Key small={small}>J</Key>
    </span>
  );
}
