'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type State = 'idle' | 'copied' | 'failed';

/** Clipboard plus a brief "Copied". The clipboard can be denied (insecure
 *  origin, permissions), which reads as "Copy failed" rather than silence. */
export function useCopy(ms = 1600) {
  const [state, setState] = useState<State>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setState('idle'), ms);
    return () => clearTimeout(t);
  }, [state, ms]);
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  }
  return { state, copy };
}

/** A small text button: "Copy", then "Copied" for a moment. `text` may be a
 *  function, read at click time so it reflects the page as it is then. */
export function CopyButton({ text, label, className }: { text: string | (() => string); label: string; className?: string }) {
  const { state, copy } = useCopy();
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      onClick={() => copy(typeof text === 'function' ? text() : text)}
      aria-label={`Copy ${label}`}
      className={cn('mono h-6 px-1.5 text-[11px] text-muted-foreground hover:text-ink', className)}
    >
      {state === 'copied' ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
      <span role="status">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Failed' : 'Copy'}</span>
    </Button>
  );
}
