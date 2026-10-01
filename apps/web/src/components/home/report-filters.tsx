'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Camera, Check, ChevronDown, Loader2, Search, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
export function ReportFilters() {
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
    for (const t of next.types ?? types) sp.append('type', t);
    start(() => router.replace(sp.size ? `/?${sp}` : '/'));
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

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className={cn(
                  'h-9 gap-1.5 bg-muted px-3 text-[15px] hover:bg-muted/70 data-popup-open:bg-muted/70',
                  types.length && 'rounded-r-none bg-foreground/8 font-medium hover:bg-foreground/10',
                )}
              />
            }
          >
            {types.length === 1 ? TYPES.find((t) => t.value === types[0])?.label : 'Type'}
            {types.length > 1 ? <span className="text-muted-foreground tabular-nums">· {types.length}</span> : null}
            <ChevronDown className="text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 p-1.5">
            {TYPES.map(({ value, label, icon: TypeIcon }) => (
              <DropdownMenuCheckboxItem
                key={value}
                checked={types.includes(value)}
                onCheckedChange={() => toggle(value)}
                closeOnClick={false}
                className="gap-3 py-2 pr-2 text-[15px] [&>[data-slot=dropdown-menu-checkbox-item-indicator]]:hidden"
              >
                <span
                  aria-hidden
                  className={cn(
                    'grid size-[18px] place-items-center rounded-[5px] border border-input bg-background transition-colors',
                    types.includes(value) && 'border-foreground bg-foreground text-background',
                  )}
                >
                  {types.includes(value) ? <Check className="size-3 [stroke-width:3]" /> : null}
                </span>
                <TypeIcon className="size-5" /> {label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {types.length ? (
          <Button
            variant="ghost"
            aria-label="Clear the type filter"
            onClick={() => go({ types: [] })}
            className="ml-px h-9 w-8 rounded-l-none bg-foreground/8 px-0 hover:bg-foreground/10"
          >
            <X />
          </Button>
        ) : null}
      </div>

      <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
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
          placeholder="Search Rekods"
          className="h-9 rounded-lg pl-9 pr-12"
          aria-label="Search titles and descriptions"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:block">
          ⌘K
        </kbd>
      </div>
    </div>
  );
}
