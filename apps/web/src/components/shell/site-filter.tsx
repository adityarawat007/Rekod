'use client';

import { useMemo, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Loader2 } from 'lucide-react';
import {
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger,
} from '@/components/ui/combobox';

type Site = { value: string; label: string; count: number | null };

const ALL: Site = { value: '', label: 'All sites', count: null };

/** The site picker: `?project=<host>`, the recorded page's host. It lives in
 *  the URL like every other filter, and the other params ride along. */
export function SiteFilter({ sites }: { sites: { project: string; count: number }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const current = params.get('project') ?? '';

  const items = useMemo<Site[]>(() => {
    const list = sites.map((s) => ({ value: s.project, label: s.project, count: s.count }));
    // An old link can name a host with nothing left on it: still show it.
    if (current && !list.some((s) => s.value === current)) list.push({ value: current, label: current, count: 0 });
    return [ALL, ...list];
  }, [sites, current]);
  const selected = items.find((s) => s.value === current) ?? ALL;

  const pick = (site: Site | null) => {
    const sp = new URLSearchParams(params.toString());
    if (site?.value) sp.set('project', site.value);
    else sp.delete('project');
    start(() => router.replace(sp.size ? `/rekod?${sp}` : '/rekod'));
  };

  return (
    <Combobox items={items} value={selected} onValueChange={pick} itemToStringLabel={(s) => s.label} isItemEqualToValue={(a, b) => a.value === b.value}>
      {/* §6.3 select chip: KEY, value, ▾ — the same chip as the workspace's. */}
      <ComboboxTrigger
        aria-label="Filter by site"
        render={
          <button
            type="button"
            className="flex h-[38px] max-w-44 shrink-0 items-center gap-2 self-center border border-line-strong bg-bg px-3 text-muted-foreground transition-colors duration-150 hover:bg-tint-soft data-popup-open:border-ink data-popup-open:bg-panel data-popup-open:text-ink narrow:max-w-64"
          />
        }
      >
        <span className="label font-normal text-faint">Filter</span>
        <span className={current ? 'min-w-0 truncate font-medium text-ink' : 'min-w-0 truncate font-medium'}>{selected.label}</span>
        {pending ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <ChevronDown className="size-4 shrink-0" />}
      </ComboboxTrigger>

      <ComboboxContent align="start" className="w-[min(18rem,calc(100vw-2rem))]">
        <ComboboxInput placeholder="Search sites" aria-label="Search sites" />
        <ComboboxEmpty>No site matches.</ComboboxEmpty>
        <ComboboxList>
          {(s: Site) => (
            <ComboboxItem key={s.value || 'all'} value={s}>
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              {s.count === null ? null : <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{s.count.toLocaleString('en')}</span>}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
