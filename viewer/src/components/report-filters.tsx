'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

const ANY = '__any';

// One list per select. It is passed to Base UI's `items` so the trigger renders
// the LABEL — without it `Select.Value` prints the raw value, which is why the
// status filter read "__any" — and the same list builds the options, so a label
// is never written twice.
type Option = { value: string; label: string };

const STATUSES: readonly Option[] = [
  { value: ANY, label: 'Any status' },
  { value: 'new', label: 'New' },
  { value: 'triaging', label: 'Triaging' },
  { value: 'fixed', label: 'Fixed' },
];

const RANGES: readonly Option[] = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: ANY, label: 'All time' },
];

function Filter({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: readonly Option[];
  value: string;
  onChange: (v: string | null) => void;
  label: string;
  className?: string;
}) {
  return (
    <Select items={items} value={value} onValueChange={onChange}>
      <SelectTrigger className={className} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Every filter lives in the URL, so a filtered list is a link you can paste
 *  into Slack — same reason reports are URLs. */
export function ReportFilters({ projects }: { projects: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get('q') ?? '');

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '' || v === ANY) next.delete(k);
      else next.set(k, v);
    }
    start(() => router.replace(next.toString() ? `/?${next}` : '/'));
  };

  // Debounced so typing doesn't fire a query per keystroke.
  useEffect(() => {
    if ((params.get('q') ?? '') === q) return;
    const id = setTimeout(() => set({ q: q || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = ['status', 'project', 'failing', 'q', 'range'].filter((k) =>
    params.get(k),
  ).length;

  const projectOptions: readonly Option[] = [
    { value: ANY, label: 'Any project' },
    ...projects.map((p) => ({ value: p, label: p })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles…"
          className="pl-9"
          aria-label="Search report titles"
        />
      </div>

      <Filter
        items={STATUSES}
        value={params.get('status') ?? ANY}
        onChange={(v) => set({ status: v })}
        label="Status"
        className="w-[130px]"
      />

      <Filter
        items={projectOptions}
        value={params.get('project') ?? ANY}
        onChange={(v) => set({ project: v })}
        label="Project"
        className="w-[150px]"
      />

      <Filter
        items={RANGES}
        value={params.get('range') ?? ANY}
        onChange={(v) => set({ range: v })}
        label="Date range"
        className="w-[140px]"
      />

      <Badge
        variant={params.get('failing') ? 'default' : 'outline'}
        className="h-9 cursor-pointer px-3"
        render={<button onClick={() => set({ failing: params.get('failing') ? null : '1' })} />}
      >
        Has failures
      </Badge>

      {active > 0 && (
        <Button variant="ghost" size="sm" onClick={() => router.replace('/')}>
          <X className="size-4" /> Clear
        </Button>
      )}
      <span
        aria-live="polite"
        className="mono text-xs text-muted-foreground"
      >
        {pending ? 'filtering…' : ''}
      </span>
    </div>
  );
}
