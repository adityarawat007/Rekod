import { ArrowBigUp, Option } from 'lucide-react';
import { cn } from '@/lib/utils';

function Key({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <kbd
      className={cn(
        'mono grid place-items-center border border-line-strong bg-panel font-medium text-ink',
        small ? 'size-7 text-xs [&_svg]:size-3.5' : 'size-9 text-sm [&_svg]:size-4',
      )}
    >
      {children}
    </kbd>
  );
}

/** ⌥⇧J as keycaps — the extension's one hotkey. Icons, not glyphs: ⇧ falls
 *  back to a half-size glyph in some faces. */
export function Shortcut({ small }: { small?: boolean }) {
  return (
    <span className="flex gap-1" aria-label="Option Shift J">
      <Key small={small}><Option /></Key>
      <Key small={small}><ArrowBigUp /></Key>
      <Key small={small}>J</Key>
    </span>
  );
}
