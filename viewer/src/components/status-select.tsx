'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Status } from '@/lib/types';

// Passed to `items` so the trigger shows "New", not the raw "new" it stores.
const STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'triaging', label: 'Triaging' },
  { value: 'fixed', label: 'Fixed' },
] as const;

/** Triage writes status and nothing else — that is all the grant allows
 *  (`grant update (status) on reports to authenticated`). */
export function StatusSelect({ id, status }: { id: string; status: Status }) {
  const router = useRouter();
  const [value, setValue] = useState<Status>(status);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function change(next: string | null) {
    if (!next) return;
    const prev = value;
    setValue(next as Status);
    setErr(null);
    const { error } = await supabaseBrowser()
      .from('reports')
      .update({ status: next })
      .eq('id', id);
    if (error) {
      setValue(prev); // optimistic, so put it back rather than lie
      setErr(error.message);
      return;
    }
    start(() => router.refresh());
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Select items={STATUSES} value={value} onValueChange={change} disabled={pending}>
        <SelectTrigger className="w-[130px]" aria-label="Report status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {err && (
        <span role="alert" className="max-w-[220px] text-right text-xs text-destructive">
          {err}
        </span>
      )}
    </div>
  );
}
