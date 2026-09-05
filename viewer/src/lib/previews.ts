import { supabaseServer } from '@/lib/supabase/server';
import type { ListRow } from '@/components/report-list';

/** Long enough to browse a page of reports without a mid-scroll expiry, short
 *  enough that a leaked URL is not a share link. Share links are the deliberate
 *  path for that — see schema-share.sql. */
const PREVIEW_TTL = 3600;

/**
 * One batched call for every thumbnail on the page. Signing per row would be a
 * round trip per report; `createSignedUrls` takes the whole list at once.
 *
 * Rows whose media is missing or unsignable are simply absent from the map —
 * the card falls back to an icon rather than a broken player.
 */
export async function previewUrls(rows: ListRow[]): Promise<Map<string, string>> {
  const paths = rows.map((r) => r.video_path).filter((p): p is string => !!p);
  if (!paths.length) return new Map();

  const supabase = await supabaseServer();
  const { data, error } = await supabase.storage.from('reports').createSignedUrls(paths, PREVIEW_TTL);
  // A failed signing run costs previews, not the page. The list is the point.
  if (error || !data) return new Map();

  const byPath = new Map<string, string>();
  for (const row of data) {
    const url = row.signedUrl ?? row.signedURL;
    if (row.path && url && !row.error) byPath.set(row.path, url);
  }
  return byPath;
}
