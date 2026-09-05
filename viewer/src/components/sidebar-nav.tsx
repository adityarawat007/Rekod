import { cache } from 'react';
import { supabaseServer } from '@/lib/supabase/server';
import { AppSidebarNav } from '@/components/app-sidebar';

/** One cheap read feeds every sidebar count and the project list. The full
 *  logs/network blobs are never touched here. cache()d so a page that also
 *  needs the project list does not run it twice. */
export const navData = cache(async () => {
  const supabase = await supabaseServer();
  // getClaims() reads the email out of the verified JWT. getUser() would be a
  // second round trip to the auth server for a string we already hold.
  const [{ data: claims }, { data: rows }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from('reports').select('project,status'),
  ]);

  const all = rows ?? [];
  const projects = new Set<string>();
  let open = 0;
  // One pass, not three: js-combine-iterations.
  for (const r of all) {
    if (r.project) projects.add(r.project);
    if (r.status === 'new') open += 1;
  }

  return {
    email: (claims?.claims.email as string | undefined) ?? null,
    projects: [...projects].sort(),
    counts: { all: all.length, new: open },
  };
});

/** Streams into the sidebar shell. Awaiting this in the layout instead would
 *  block first paint of the whole dashboard on a database round trip. */
export async function SidebarNav() {
  return <AppSidebarNav {...await navData()} />;
}
