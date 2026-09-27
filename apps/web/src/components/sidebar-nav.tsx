import { cache } from 'react';
import { requireActor } from '@/lib/server/session';
import { projectsOf } from '@/lib/server/reports';
import { AppSidebarNav } from '@/components/app-sidebar';

/** One cheap read feeds every sidebar count and the project list. The full
 *  logs/network blobs are never touched here. cache()d so a page that also
 *  needs the project list does not run it twice. */
export const navData = cache(async () => {
  const a = await requireActor();
  const { projects, total } = await projectsOf(a.workspaceId);
  return { email: a.email, name: a.name, image: a.image, projects, counts: { all: total } };
});

/** Streams into the sidebar shell. Awaiting this in the layout instead would
 *  block first paint of the whole dashboard on a database round trip. */
export async function SidebarNav() {
  return <AppSidebarNav {...await navData()} />;
}
