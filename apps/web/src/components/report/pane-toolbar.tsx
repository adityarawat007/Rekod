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
    <div className="flex h-11 shrink-0 items-center gap-3 border-b bg-muted/40 px-4">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <Input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      {children}
    </div>
  );
}
