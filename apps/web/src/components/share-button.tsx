'use client';

import { useState, useSyncExternalStore } from 'react';
import { Check, ChevronDown, Link2, Loader2, PanelsTopLeft, Unlink, Video } from 'lucide-react';
import { revokeShare, shareToken as fetchToken } from '@/app/(dash)/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** The dashboard's own origin, whatever it happens to be — there is no
 *  NEXT_PUBLIC_SITE_URL to keep in step with reality. Read through
 *  useSyncExternalStore rather than straight off `window`, because this is a
 *  client component and Next still renders it on the server, where `window`
 *  does not exist. The server snapshot is '' and the client re-reads after
 *  hydration, so there is no mismatch either. */
const NEVER = () => () => {};
const useOrigin = () =>
  useSyncExternalStore(NEVER, () => window.location.origin, () => '');

/** What the recipient gets. `media` drops the log pane — same report, same
 *  page, one query parameter. Kept as a suffix rather than a second route so
 *  a recipient who deletes it lands on the full view rather than a 404. */
type Mode = 'devtools' | 'media';
const suffix = (m: Mode) => (m === 'media' ? '?view=media' : '');

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
  const link = token && origin ? `${origin}/s/${token}${suffix(mode)}` : null;

  /**
   * Copy is the whole interaction, and it can be repeated forever: every
   * report is born with a token, and the same one comes back every time. The
   * recipient's page signs its own media URL per visit, so nothing here has to
   * be signed or stored. Only after "Stop sharing" is there no token, and then
   * this mints a fresh one.
   */
  async function copy(m: Mode = mode) {
    setBusy(true);
    setErr(null);
    try {
      const t = token ?? (await fetchToken(id));
      setToken(t);
      // Clipboard is permission-gated and throws on a denial; the popover's
      // input holds the same string for selecting by hand.
      await navigator.clipboard.writeText(`${origin}/s/${t}${suffix(m)}`);
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
      <Button onClick={() => copy()} disabled={busy} className="rounded-r-none">
        {busy ? <Loader2 className="animate-spin" /> : copied ? <Check /> : <Link2 />}
        {copied ? 'Copied' : 'Copy link'}
      </Button>

      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="default"
              aria-label="Share options"
              className="rounded-l-none border-l border-background/25 px-2"
            >
              <ChevronDown />
            </Button>
          }
        />
        <PopoverContent align="end" className="w-80">
          <PopoverTitle>Share this ReKod</PopoverTitle>
          <PopoverDescription>
            Anyone with the link can open it without an account. The console and network log were
            redacted in the browser at capture.
          </PopoverDescription>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <ModeCard
              icon={PanelsTopLeft}
              label="With DevTools"
              hint="Player and log"
              on={mode === 'devtools'}
              onClick={() => setMode('devtools')}
            />
            <ModeCard
              icon={Video}
              label="Video only"
              hint="No log pane"
              on={mode === 'media'}
              onClick={() => setMode('media')}
            />
          </div>

          <div className="mt-3 flex gap-2">
            <Input
              readOnly
              value={link ?? 'Copy once to create the link'}
              aria-label="Share link"
              className="mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button size="icon" variant="outline" onClick={() => copy()} aria-label="Copy link">
              {copied ? <Check /> : <Link2 />}
            </Button>
          </div>

          {token ? (
            <Button variant="ghost" size="sm" className="mt-2 w-full text-muted-foreground" onClick={stop} disabled={busy}>
              <Unlink /> Stop sharing — the current link stops working
            </Button>
          ) : null}

          {err ? (
            <p role="alert" className="mt-3 text-xs text-destructive">
              {err}
            </p>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ModeCard({
  icon: Icon,
  label,
  hint,
  on,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  hint: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'rounded-lg border p-3 text-left transition-colors hover:border-jam/60',
        on && 'border-jam bg-jam/5',
      )}
    >
      <Icon className={cn('size-5', on ? 'text-jam' : 'text-muted-foreground')} aria-hidden />
      <span className="mt-2 block text-xs font-medium">{label}</span>
      <span className="block text-[11px] text-muted-foreground">{hint}</span>
    </button>
  );
}
