'use client';

import { useState, useSyncExternalStore, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Link2, Loader2 } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { ShareFields } from '@/lib/types';

/** One year. The link dies when the signed media URL does, so there is no
 *  second expiry to reason about — see schema-share.sql. */
const SIGNED_URL_TTL = 31_536_000;

/** The dashboard's own origin, whatever it happens to be — there is no
 *  NEXT_PUBLIC_SITE_URL to keep in step with reality. Read through
 *  useSyncExternalStore rather than straight off `window`, because this is a
 *  client component and Next still renders it on the server, where `window`
 *  does not exist. The server snapshot is '' and the client re-reads after
 *  hydration, so there is no mismatch either. */
const NEVER = () => () => {};
const useOrigin = () =>
  useSyncExternalStore(NEVER, () => window.location.origin, () => '');

type Props = {
  id: string;
  videoPath: string | null;
  /** The row's current token. Null means the report is private. */
  shareToken: ShareFields['share_token'];
};

export function ShareButton({ id, videoPath, shareToken }: Props) {
  const router = useRouter();
  const [token, setToken] = useState(shareToken);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const origin = useOrigin();
  const link = token && origin ? `${origin}/s/${token}` : null;

  async function create() {
    setBusy(true);
    setErr(null);
    const supabase = supabaseBrowser();
    try {
      // Signed here, while a session that satisfies the storage policy exists.
      // The recipient is anonymous and could never sign this themselves.
      let url: string | null = null;
      if (videoPath) {
        const { data, error } = await supabase.storage
          .from('reports')
          .createSignedUrl(videoPath, SIGNED_URL_TTL);
        if (error) throw error;
        url = data.signedUrl;
      }

      const next = crypto.randomUUID();
      const { error } = await supabase
        .from('reports')
        .update({ share_token: next, share_url: url })
        .eq('id', id);
      if (error) throw error;

      setToken(next);
      await copy(`${origin}/s/${next}`);
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setErr(null);
    const { error } = await supabaseBrowser()
      .from('reports')
      .update({ share_token: null, share_url: null })
      .eq('id', id);
    setBusy(false);
    if (error) return setErr(error.message);
    setToken(null);
    startTransition(() => router.refresh());
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is permission-gated; the input is selectable either way.
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant={token ? 'secondary' : 'outline'}>
            <Link2 /> {token ? 'Shared' : 'Share'}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80">
        <PopoverTitle>Share this report</PopoverTitle>
        <PopoverDescription>
          {token
            ? 'Anyone with the link can watch the recording and read the console and network log. No account needed.'
            : 'Creates a link that works without an account. The console and network log go with it — already redacted at capture.'}
        </PopoverDescription>

        {link ? (
          <div className="mt-3 space-y-3">
            <div className="flex gap-2">
              <Input
                readOnly
                value={link}
                aria-label="Share link"
                className="mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                size="icon"
                variant="outline"
                onClick={() => copy(link)}
                aria-label="Copy link"
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={revoke} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} Revoke link
            </Button>
            <p className="text-xs text-muted-foreground">
              Revoking takes the page down at once. A recipient who saved the video file
              itself keeps that copy.
            </p>
          </div>
        ) : (
          <Button className="mt-3 w-full" onClick={create} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Link2 />} Create link
          </Button>
        )}

        {err ? (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {err}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
