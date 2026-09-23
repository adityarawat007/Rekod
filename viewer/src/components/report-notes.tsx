'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { ago } from '@/lib/format';
import type { Comment } from '@/lib/types';

/**
 * The two writable surfaces on a report: its own title/description, and the
 * comment thread. Both are plain column updates through the browser client —
 * `grant update (title, description, comments, …)` plus the owner-only RLS
 * policy is the entire authorisation story, so there is no route handler and
 * no server action in the middle.
 *
 * One file, because they are the same three lines of Supabase call twice over
 * and they always render together.
 */
const patch = (id: string, fields: Record<string, unknown>) =>
  supabaseBrowser().from('reports').update(fields).eq('id', id).select('id').single();

/** Borderless on purpose: these read as the heading and the blurb until you
 *  click into them. The ring appears on focus so they are still findable. */
const FIELD =
  'w-full rounded-md bg-transparent px-2 py-1 -mx-2 outline-none ' +
  'placeholder:text-muted-foreground/60 hover:bg-muted/50 ' +
  'focus:bg-muted/50 focus:ring-2 focus:ring-ring/40 transition-colors';

export function ReportNotes({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string | null;
}) {
  const [err, setErr] = useState<string | null>(null);

  // Saved on blur, not per keystroke: a comparison against what the server sent
  // means tabbing through without typing writes nothing. There is no "Saved"
  // toast — the field keeping what you typed is the receipt.
  const commit = (field: 'title' | 'description', was: string) => async (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const value = e.currentTarget.value.trim();
    if (value === was.trim()) return;
    setErr(null);
    // title is NOT NULL; description is nullable and an empty box means null.
    const { error } = await patch(id, { [field]: field === 'title' ? value : value || null });
    if (error) setErr(error.message);
  };

  return (
    <div className="min-w-0">
      <input
        key={`t-${id}`}
        defaultValue={title}
        placeholder="Title"
        aria-label="Report title"
        onBlur={commit('title', title)}
        className={`${FIELD} font-heading text-2xl font-extrabold leading-tight`}
      />
      <textarea
        key={`d-${id}`}
        defaultValue={description ?? ''}
        placeholder="Add a description…"
        aria-label="Report description"
        // field-sizing grows it to fit in Chrome; rows=2 is what Firefox and
        // Safari get instead, which is a usable box rather than a slit.
        rows={2}
        onBlur={commit('description', description ?? '')}
        className={`${FIELD} mt-1 resize-none field-sizing-content text-sm text-muted-foreground`}
      />
      {err ? (
        <p role="alert" className="px-0.5 text-xs text-destructive">
          Not saved — {err}
        </p>
      ) : null}
    </div>
  );
}

export function Comments({
  id,
  comments,
  author,
  readOnly,
}: {
  id: string;
  comments: Comment[];
  /** The poster's email, from the verified JWT on the server. Null on the
   *  share page, which never posts. */
  author?: string | null;
  readOnly?: boolean;
}) {
  // Local list is the source of truth after the first render: a router.refresh()
  // per comment would re-run the report query and re-sign the video URL, which
  // restarts the player mid-watch. The row is re-read on the next navigation.
  const [list, setList] = useState(comments);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ponytail: the whole array is rewritten on every post and delete, so two
  // tabs posting in the same second lose one comment. One account, one tab —
  // see the upgrade note at the bottom of schema-comments.sql.
  async function write(next: Comment[]) {
    setBusy(true);
    setErr(null);
    const { error } = await patch(id, { comments: next });
    setBusy(false);
    if (error) { setErr(error.message); return false; }
    setList(next);
    return true;
  }

  async function post(e: React.SyntheticEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    const entry = { id: crypto.randomUUID(), body: text, at: new Date().toISOString(), by: author ?? null };
    // Cleared only once it is stored — on a failure the box still holds it,
    // because typing a comment twice is worse than any error message.
    if (await write([...list, entry])) setBody('');
  }

  return (
    <section className="mt-1" aria-label="Comments">
      <h2 className="text-sm font-semibold">
        {list.length ? `${list.length} comment${list.length === 1 ? '' : 's'}` : 'Comments'}
      </h2>

      <ul className="mt-4 space-y-4">
        {list.map((c) => (
          <li key={c.id} className="group flex gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="mono truncate">{c.by ?? 'unknown'}</span>
                <span aria-hidden>·</span>
                <span className="shrink-0">{ago(c.at)}</span>
              </p>
              {/* Captured pages are untrusted; this is the owner's own typing,
                  and it is rendered as text either way. No markdown, no html. */}
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
            </div>
            {readOnly ? null : (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete comment"
                disabled={busy}
                onClick={() => write(list.filter((x) => x.id !== c.id))}
                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </li>
        ))}
        {!list.length ? (
          <li className="text-sm text-muted-foreground">
            {readOnly ? 'No comments on this ReKod.' : 'Nothing yet. Add the first one.'}
          </li>
        ) : null}
      </ul>

      {readOnly ? null : (
        <form onSubmit={post} className="mt-5 rounded-lg border bg-card p-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            // ⌘/Ctrl+Enter, the same send chord as the extension's compose card.
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(e); }}
            placeholder="Write a comment"
            aria-label="Write a comment"
            rows={2}
            className="w-full resize-none bg-transparent p-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={busy || !body.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : null} Comment
            </Button>
          </div>
        </form>
      )}

      {err ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {err}
        </p>
      ) : null}
    </section>
  );
}
