'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { reportMarkdown, type MarkdownInput } from '@/lib/report-markdown';

/** What the owner's page can change without a refresh: the notes and the share
 *  token. "Copy as Markdown" reads these at click time, so it never carries a
 *  stale title or a revoked link. */
type Live = {
  title: string;
  description: string | null;
  shareToken: string | null;
};
type Static = Omit<MarkdownInput, 'title' | 'description' | 'link'> & {
  id: string;
  /** Canonical origin from the server's config, not from request headers. */
  origin: string;
};
type Ctx = {
  setNotes: (n: Partial<Pick<Live, 'title' | 'description'>>) => void;
  setShareToken: (t: string | null) => void;
  markdown: () => string;
};

const C = createContext<Ctx | null>(null);

export function ReportMarkdownProvider({
  init,
  fixed,
  children,
}: {
  init: Live;
  fixed: Static;
  children: React.ReactNode;
}) {
  const [live, setLive] = useState(init);
  const setNotes = useCallback((n: Partial<Pick<Live, 'title' | 'description'>>) => setLive((l) => ({ ...l, ...n })), []);
  const setShareToken = useCallback((shareToken: string | null) => setLive((l) => ({ ...l, shareToken })), []);
  const markdown = useCallback(() => {
    const { id, origin, ...rest } = fixed;
    const l = live;
    // A share link only if one exists now; copying must not mint a token.
    const link = `${origin}${l.shareToken ? `/c/${l.shareToken}` : `/reports/${id}`}`;
    return reportMarkdown({ ...rest, title: l.title, description: l.description, link });
  }, [fixed, live]);
  const value = useMemo(() => ({ setNotes, setShareToken, markdown }), [setNotes, setShareToken, markdown]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

/** Null outside the owner's page (a share link has no Markdown to copy). */
export const useReportMarkdown = () => useContext(C);
