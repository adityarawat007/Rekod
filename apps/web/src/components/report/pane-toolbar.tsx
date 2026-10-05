import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

/** Same height on every tab, so switching tabs moves nothing. */
export function PaneToolbar({
  query,
  onQuery,
  placeholder,
  children,
}: {
  query: string;
  onQuery: (q: string) => void;
  placeholder: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4 narrow:px-6">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="pl-9"
        />
      </div>
      {children}
    </div>
  );
}
