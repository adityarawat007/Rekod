'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

/** The search lives in the URL, so a search is a link you can paste into
 *  Slack — same reason reports are URLs. */
export function ReportFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get('q') ?? '');

  // Debounced so typing doesn't fire a query per keystroke.
  useEffect(() => {
    if ((params.get('q') ?? '') === q) return;
    const id = setTimeout(() => start(() => router.replace(q ? `/?${new URLSearchParams({ q })}` : '/')), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles and descriptions…"
          className="pl-9"
          aria-label="Search ReKods"
        />
      </div>
      <span aria-live="polite" className="mono text-xs text-muted-foreground">
        {pending ? 'searching…' : ''}
      </span>
    </div>
  );
}
