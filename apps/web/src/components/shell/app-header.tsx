import { Suspense } from 'react';
import Link from 'next/link';
import { currentActor, currentUser } from '@/lib/server/session';
import { workspacesLeft, workspacesOf } from '@/lib/server/workspaces';
import { projectsOf } from '@/lib/server/reports';
import { Brand } from '@/components/shell/brand';
import { SiteFilter } from '@/components/shell/site-filter';
import { UserMenu } from '@/components/shell/user-menu';
import { WorkspaceSwitcher } from '@/components/shell/workspace-switcher';
import { ThemeToggle } from '@/components/theme/toggle';
import { SiteFilterSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

/** §6.1. Static: the brand and the tab paint with the shell, the rest streams.
 *  ≤760px it scrolls sideways and the theme toggle goes (§4). */
export function AppHeader() {
  return (
    <header className="flex h-16 shrink-0 items-stretch gap-4 overflow-x-auto border-b bg-panel px-4 narrow:gap-7 narrow:px-7">
      <div className="flex items-center">
        <Brand />
      </div>
      <nav aria-label="Main" className="flex items-stretch">
        {/* The one page with a header; it is always the active tab. */}
        <Link
          href="/rekod"
          aria-current="page"
          className="relative flex items-center font-medium text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary"
        >
          Rekods
        </Link>
      </nav>
      {/* Page-scoped, so it sits with the tab, not with the account chips. */}
      <Suspense fallback={<SiteFilterSkeleton />}>
        <HeaderSites />
      </Suspense>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Suspense fallback={<Skeleton className="h-[38px] w-44" />}>
          <HeaderWorkspace />
        </Suspense>
        <ThemeToggle className="hidden narrow:inline-flex" />
        <Suspense fallback={<Skeleton className="size-[38px] rounded-full" />}>
          <HeaderUser />
        </Suspense>
      </div>
    </header>
  );
}

/** currentActor() is cache()d, so this shares the page's lookup. */
async function HeaderWorkspace() {
  const a = await currentActor();
  if (!a) return null;
  const [list, { plan, left }] = await Promise.all([workspacesOf(a.userId), workspacesLeft(a.userId)]);
  return <WorkspaceSwitcher workspaces={list} active={a.workspaceId} plan={plan} canCreate={left > 0} />;
}

/** Same cache()d actor; one grouped query for the site list. */
async function HeaderSites() {
  const a = await currentActor();
  if (!a) return null;
  return <SiteFilter sites={await projectsOf(a.workspaceId)} />;
}

/** From the signed cookie cache: no database round trip. Display only. */
async function HeaderUser() {
  const u = await currentUser();
  return <UserMenu email={u?.email ?? null} name={u?.name} image={u?.image} />;
}
