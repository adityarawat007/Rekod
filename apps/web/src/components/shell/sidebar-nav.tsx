import { currentActor, currentUser } from '@/lib/server/session';
import { workspacesLeft, workspacesOf } from '@/lib/server/workspaces';
import { SidebarUser } from '@/components/shell/app-sidebar';
import { WorkspaceSwitcher } from '@/components/shell/workspace-switcher';

/** From the signed cookie cache: no database round trip. */
async function navData() {
  const u = await currentUser();
  return { email: u?.email ?? null, name: u?.name, image: u?.image };
}

/** Display only; requireActor() on the page is the real check. */
export async function SidebarNav() {
  return <SidebarUser {...await navData()} />;
}

/** currentActor() is cache()d, so this shares the page's lookup. */
export async function SidebarWorkspace() {
  const a = await currentActor();
  if (!a) return null;
  const [list, { plan, left }] = await Promise.all([workspacesOf(a.userId), workspacesLeft(a.userId)]);
  return <WorkspaceSwitcher workspaces={list} active={a.workspaceId} plan={plan} canCreate={left > 0} />;
}
