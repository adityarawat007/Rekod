import { sharedReport } from '@/lib/server/reports';

/** The image behind a share link's unfurl, at a URL that never expires: it
 *  resolves the token and redirects to a freshly signed bucket URL. Read
 *  through sharedReport() like the page, without the log files; nothing but
 *  the picture leaves. A video with no poster (old recordings) has none. */
export async function shareImage(token: string) {
  const report = await sharedReport(token, false, false);
  const m = report?.media;
  const src = m ? (m.kind === 'shot' ? m.url : m.poster) : null;
  if (!src) return new Response(null, { status: 404 });
  // Short, so a revoked link stops being fetched; the signature lasts an hour.
  return new Response(null, { status: 302, headers: { location: src, 'cache-control': 'public, max-age=300' } });
}
