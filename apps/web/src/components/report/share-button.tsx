'use client';

import { useState, useSyncExternalStore } from 'react';
import { Check, ChevronDown, Globe, Link2, Loader2, Play, Unlink } from 'lucide-react';
import { revokeShare, shareToken as fetchToken } from '@/app/(dash)/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** The dashboard's own origin, with no NEXT_PUBLIC_SITE_URL to drift.
 *  useSyncExternalStore because the server render has no `window`. */
const NEVER = () => () => {};
const useOrigin = () =>
  useSyncExternalStore(NEVER, () => window.location.origin, () => '');

/** /c/ is the full view, /v/ the video only — one token, two renders. */
type Mode = 'devtools' | 'media';
const shareUrl = (origin: string, token: string, m: Mode) => `${origin}/${m === 'media' ? 'v' : 'c'}/${token}`;

type Props = {
  id: string;
  /** Null only after "Stop sharing"; the next copy mints a new one. */
  shareToken: string | null;
};

export function ShareButton({ id, shareToken }: Props) {
  const [token, setToken] = useState(shareToken);
  const [mode, setMode] = useState<Mode>('devtools');
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const origin = useOrigin();
  const link = token && origin ? shareUrl(origin, token, mode) : null;

  /** The same token every time; only after "Stop sharing" is a new one minted. */
  async function copy(m: Mode = mode) {
    setBusy(true);
    setErr(null);
    try {
      const t = token ?? (await fetchToken(id));
      setToken(t);
      // Clipboard can be denied; the input holds the link for copying by hand.
      await navigator.clipboard.writeText(shareUrl(origin, t, m));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Kills the current link for everyone holding it. */
  async function stop() {
    setBusy(true);
    setErr(null);
    try {
      await revokeShare(id);
      setToken(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center">
      <Button size="lg" onClick={() => copy()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : copied ? <Check /> : <Link2 />}
        {copied ? 'Copied' : 'Copy link'}
      </Button>

      <Popover>
        <PopoverTrigger
          render={
            <Button
              size="icon-lg"
              aria-label="Share options"
              className="border-l border-l-on-primary/30"
            >
              <ChevronDown />
            </Button>
          }
        />
        <PopoverContent align="end" className="w-[22rem] gap-4 p-5">
          <div className="flex items-center justify-between">
            <PopoverTitle className="text-base font-semibold">Share</PopoverTitle>
            <span className="label flex items-center gap-1.5 text-muted-foreground">
              <Globe className="size-3.5" /> Anyone with the link
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="What the link shows">
            <ModeCard label="With DevTools" on={mode === 'devtools'} onClick={() => setMode('devtools')}>
              <div className="flex h-full gap-1">
                <div className="flex-[3] bg-chrome" />
                <div className="flex flex-[2] flex-col gap-1 bg-panel p-1">
                  {[80, 60, 70, 45].map((w, i) => (
                    <span key={i} className={cn('h-1', i === 2 ? 'bg-error' : 'bg-line')} style={{ width: `${w}%` }} />
                  ))}
                </div>
              </div>
            </ModeCard>
            <ModeCard label="Video only" on={mode === 'media'} onClick={() => setMode('media')}>
              <div className="grid h-full place-items-center bg-chrome">
                <Play className="size-3 fill-on-chrome text-on-chrome" />
              </div>
            </ModeCard>
          </div>

          <div className="flex gap-2">
            <Input
              readOnly
              value={link ?? 'Copy once to create the link'}
              aria-label="Share link"
              className="mono text-xs text-muted-foreground"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button variant="outline" size="lg" onClick={() => copy()} disabled={busy}>
              {copied ? <Check /> : <Link2 />} {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          {token ? (
            <Button variant="destructive" size="sm" className="w-fit" onClick={stop} disabled={busy}>
              <Unlink /> Stop sharing
            </Button>
          ) : null}

          {err ? (
            <p role="alert" className="text-xs text-error">
              {err}
            </p>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ModeCard({
  label,
  on,
  onClick,
  children,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'border border-line-strong p-1.5 text-left transition-colors duration-150 hover:bg-bg',
        on && 'outline-[2.5px] outline-offset-2 outline-selected outline-solid',
      )}
    >
      <div className="aspect-[16/9] bg-bg p-1.5" aria-hidden>
        {children}
      </div>
      <span className="mt-1.5 block px-1 pb-0.5 text-[13px] font-medium text-ink">{label}</span>
    </button>
  );
}
