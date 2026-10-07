'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, SendHorizontal, Trash2 } from 'lucide-react';
import { addComment, deleteComment, saveNotes } from '@/app/(dash)/actions';
import { useReportMarkdown } from '@/components/report/markdown-context';
import { Button } from '@/components/ui/button';
import { ago } from '@/lib/format';
import type { Comment } from '@/lib/types';

/** Both go through server actions, which take the workspace from the
 *  session: this names a report, never a tenant. */
const failed = (e: unknown) => (e instanceof Error ? e.message : String(e));

const FIELD =
  'block w-full bg-transparent px-2 py-1 -mx-2 outline-none transition-colors duration-150 ' +
  'placeholder:text-faint hover:bg-panel focus:bg-panel';

/** The title, with the page's host under it, edited in place. */
export function ReportNotes({
  id,
  title,
  description,
  host,
}: {
  id: string;
  title: string;
  description: string | null;
  host?: string | null;
}) {
  const md = useReportMarkdown();
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  // Saved on blur, and only if it differs from what was last saved — not the
  // first render's value, or changing a field and back would never save.
  const last = useRef({ title: title.trim(), description: (description ?? '').trim() });
  const commit = async (
    field: 'title' | 'description', e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const value = e.currentTarget.value.trim();
    if (value === last.current[field]) return;
    setErr(null);
    setSaved(false);
    // title is NOT NULL; description is nullable and an empty box means null.
    try {
      await saveNotes(id, field === 'title' ? { title: value } : { description: value || null });
      last.current[field] = value;
      md?.setNotes(field === 'title' ? { title: value } : { description: value || null });
      setSaved(true);
    } catch (e) {
      setErr(failed(e));
    }
  };

  return (
    <div className="min-w-0">
      <h1 className="text-2xl leading-tight">
        <textarea
          key={`t-${id}`}
          defaultValue={title}
          placeholder="Add a title"
          aria-label="Rekod title"
          rows={1}
          onBlur={(e) => commit('title', e)}
          // A title is one line; Enter saves instead of breaking it.
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          className={`${FIELD} resize-none field-sizing-content text-ink`}
        />
        {host ? <span className="mono mt-1 block text-xs font-normal tracking-normal text-muted-foreground">{host}</span> : null}
      </h1>
      <textarea
        key={`d-${id}`}
        defaultValue={description ?? ''}
        placeholder="Add a description…"
        aria-label="Rekod description"
        // field-sizing is Chrome-only; rows=2 is the fallback.
        rows={2}
        onBlur={(e) => commit('description', e)}
        className={`${FIELD} mt-2 resize-none field-sizing-content text-[15px] leading-relaxed text-muted-foreground`}
      />
      <p role="status" className="mono h-4 text-[11px] text-muted-foreground">{saved ? 'Saved' : ''}</p>
      {err ? (
        <p role="alert" className="px-0.5 text-xs text-error">
          Not saved: {err}. Try again.
        </p>
      ) : null}
    </div>
  );
}

export function Comments({
  id,
  comments,
  readOnly,
}: {
  id: string;
  comments: Comment[];
  readOnly?: boolean;
}) {
  // Local state, not router.refresh(): a refresh re-signs the video URL and
  // restarts the player mid-watch.
  const [list, setList] = useState(comments);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function post(e: React.SyntheticEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const c = await addComment(id, text);
      setList((l) => [...l, c]);
      // Cleared only once stored, so a failure keeps the text.
      setBody('');
    } catch (e) {
      setErr(failed(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(commentId: string) {
    setBusy(true);
    setErr(null);
    try {
      await deleteComment(commentId);
      setList((l) => l.filter((x) => x.id !== commentId));
    } catch (e) {
      setErr(failed(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Comments" className="space-y-4">
      {list.length ? (
        <h2 className="label text-muted-foreground">
          {list.length} comment{list.length === 1 ? '' : 's'}
        </h2>
      ) : null}

      <ul className="space-y-4">
        {list.map((c) => (
          <li key={c.id} className="group flex gap-3">
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-full bg-cell text-[11px] font-semibold uppercase text-ink"
            >
              {c.by?.[0] ?? '?'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[13px]">
                <span className="truncate font-medium">{c.by ?? 'unknown'}</span>
                <span className="mono shrink-0 text-xs text-muted-foreground">{ago(c.at)}</span>
              </p>
              {/* Plain text, never markdown or HTML. */}
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
            </div>
            {readOnly ? null : (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete comment"
                disabled={busy}
                onClick={() => remove(c.id)}
                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </li>
        ))}
        {!list.length && readOnly ? (
          <li className="text-sm text-muted-foreground">No comments on this rekod.</li>
        ) : null}
      </ul>

      {readOnly ? null : (
        <form
          onSubmit={post}
          className="border border-line-strong bg-panel p-3 transition-colors duration-150 focus-within:border-ink"
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(e); }}
            placeholder="Write a comment"
            aria-label="Write a comment"
            rows={2}
            className="w-full resize-none bg-transparent px-1 text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-end gap-3">
            <span className="mono hidden text-[11px] text-muted-foreground sm:inline">⌘↵ to send</span>
            <Button type="submit" size="sm" variant="outline" disabled={busy || !body.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <SendHorizontal />} Comment
            </Button>
          </div>
        </form>
      )}

      {err ? (
        <p role="alert" className="mt-2 text-xs text-error">
          {err}
        </p>
      ) : null}
    </section>
  );
}
