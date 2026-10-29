'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Camera, Check, ChevronDown, Loader2, Search, Video, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const TYPES = [
  { value: 'screenshot', label: 'Screenshot', icon: Camera },
  { value: 'video', label: 'Video', icon: Video },
] as const;

/** Filters live in the URL, so a filtered list is a link you can paste. */
/** `site` is the site picker, a server-fed chip that sits just before the search box. */
export function ReportFilters({ site }: { site?: React.ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get('q') ?? '');
  const types = params.getAll('type');
  const input = useRef<HTMLInputElement>(null);

  const go = (next: { q?: string; types?: string[] }) => {
    const sp = new URLSearchParams();
    const query = next.q ?? q;
    if (query) sp.set('q', query);
    const project = params.get('project');
    if (project) sp.set('project', project);
    for (const t of next.types ?? types) sp.append('type', t);
    start(() => router.replace(sp.size ? `/rekod?${sp}` : '/rekod'));
  };

  useEffect(() => {
    if ((params.get('q') ?? '') === q) return;
    const id = setTimeout(() => go({ q }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggle = (t: string) => go({ types: types.includes(t) ? types.filter((x) => x !== t) : [...types, t] });
  const Icon = pending ? Loader2 : Search;
  const value = types.length === 1 ? TYPES.find((t) => t.value === types[0])?.label : types.length ? `${types.length} types` : 'All';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
      {/* §6.3 chip. Active: --ink border on --panel, with ×. Inactive: ▾. */}
      <div
        className={cn(
          'flex h-[38px] items-center border transition-colors duration-150',
          types.length ? 'border-ink bg-panel text-ink' : 'border-line-strong bg-bg text-muted-foreground',
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<button type="button" className="flex h-full items-center gap-2 pl-3 pr-2 hover:bg-tint-soft data-popup-open:bg-tint-soft" />}
          >
            <span className="label font-normal text-faint">Type</span>
            <span className="font-medium">{value}</span>
            {types.length ? null : <ChevronDown className="size-4" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 p-1">
            {TYPES.map(({ value, label, icon: TypeIcon }) => (
              <DropdownMenuCheckboxItem
                key={value}
                checked={types.includes(value)}
                onCheckedChange={() => toggle(value)}
                closeOnClick={false}
                className="gap-3 py-2 pr-2 [&>[data-slot=dropdown-menu-checkbox-item-indicator]]:hidden"
              >
                {/* §6.11 checkbox: 17px, square. */}
                <span
                  aria-hidden
                  className={cn(
                    'grid size-[17px] place-items-center border-[1.5px] border-line-strong bg-panel transition-colors duration-150',
                    types.includes(value) && 'border-ink bg-ink text-panel',
                  )}
                >
                  {types.includes(value) ? <Check className="size-3 [stroke-width:3]" /> : null}
                </span>
                <TypeIcon className="size-4" /> {label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {types.length ? (
          <button
            type="button"
            aria-label="Remove the type filter"
            onClick={() => go({ types: [] })}
            className="grid h-full w-8 place-items-center hover:bg-tint-soft"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {site}

      <div className="relative min-w-0 flex-1 sm:w-80 sm:flex-none">
        <Icon
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground',
            pending && 'animate-spin',
          )}
        />
        <Input
          ref={input}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search rekods"
          className="pl-9 pr-12"
          aria-label="Search titles and descriptions"
        />
        <kbd className="mono pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 border border-line-strong px-1.5 text-[11px] leading-5 text-muted-foreground sm:block">
          ⌘K
        </kbd>
      </div>

      {types.length || q ? (
        <button
          type="button"
          onClick={() => {
            setQ('');
            go({ q: '', types: [] });
          }}
          className="mono inline-flex h-8 items-center text-[12.5px] font-medium text-ink underline underline-offset-4 hover:text-primary"
        >
          Clear filters
        </button>
      ) : null}

    </div>
  );
}
