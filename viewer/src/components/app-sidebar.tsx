'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Inbox, LogOut } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@/components/ui/sidebar';

export type NavData = {
  email: string | null;
  projects: string[];
  counts: { all: number };
};


/** Shown while the nav query streams in. Same shape as the real thing, so the
 *  sidebar does not jump when it arrives. */
export function AppSidebarSkeleton() {
  return (
    <SidebarMenu>
      {Array.from({ length: 6 }, (_, i) => (
        <SidebarMenuItem key={i}>
          <SidebarMenuSkeleton showIcon={i < 2} />
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

export function AppSidebarNav({ email, projects, counts }: NavData) {
  const path = usePathname();
  const params = useSearchParams();
  const q = (key: string) => params.get(key);
  const onList = path === '/';
  const unfiltered = onList && !params.toString();

  return (
    <>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={unfiltered} render={<Link href="/" />}>
                  <Inbox />
                  <span>All ReKods</span>
                </SidebarMenuButton>
                {counts.all > 0 && <SidebarMenuBadge>{counts.all}</SidebarMenuBadge>}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {projects.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Projects</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {projects.map((p) => (
                  <SidebarMenuItem key={p}>
                    <SidebarMenuButton
                      isActive={onList && q('project') === p}
                      tooltip={p}
                      render={<Link href={`/?project=${encodeURIComponent(p)}`} />}
                    >
                      <span className="mono truncate">{p}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <ThemeToggle />
        <div className="flex items-center gap-2 rounded-md border bg-card/50 p-2">
          <p className="min-w-0 flex-1 truncate text-xs font-medium">{email ?? 'signed in'}</p>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out">
              <LogOut />
            </Button>
          </form>
        </div>
      </SidebarFooter>
    </>
  );
}

/** The chrome, rendered instantly. `children` is the nav, which streams. */
export function AppSidebar({ children }: { children: React.ReactNode }) {
  return (
    <Sidebar>
      <SidebarHeader>
        <Brand />
      </SidebarHeader>
      {children}
    </Sidebar>
  );
}
