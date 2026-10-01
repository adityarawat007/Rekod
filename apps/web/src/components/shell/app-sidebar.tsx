'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

export type NavUser = {
  email: string | null;
  name?: string | null;
  /** The Google profile picture, when the account came from (or linked) Google. */
  image?: string | null;
};

export function SidebarUserSkeleton() {
  return <div className="h-12 rounded-lg" />;
}

export function SidebarWorkspaceSkeleton() {
  return <div className="flex h-12 items-center gap-2.5 px-2"><Skeleton className="size-6 rounded-md" /><Skeleton className="h-4 w-28" /></div>;
}

// Static: no data, so it paints with the shell.
function Nav() {
  const path = usePathname();
  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={path === '/'}
                render={<Link href="/" />}
                className="h-9 gap-2.5 px-2.5 font-medium data-active:font-semibold"
              >
                <LayoutGrid />
                <span>All Rekods</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  );
}

export function SidebarUser({ email, name, image }: NavUser) {
  return (
    <>
      {/* Light only: uncomment with dropping `forcedTheme` in theme/provider.tsx. */}
      {/* <ThemeToggle /> */}
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
        <Avatar className="size-7">
          {/* Google's avatar host refuses some requests that carry a Referer. */}
          {image ? <AvatarImage src={image} alt="" referrerPolicy="no-referrer" /> : null}
          <AvatarFallback className="bg-zinc-200 text-[11px] font-semibold text-foreground">{initials(name, email)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 leading-tight">
          {name ? <p className="truncate text-[13px] font-medium text-foreground">{name}</p> : null}
          <p className="truncate text-xs text-muted-foreground">{email ?? 'signed in'}</p>
        </div>
      </div>
    </>
  );
}

/** "Aditya Rawat" and "aditya.rawat" both → AR. */
function initials(name?: string | null, email?: string | null) {
  const src = (name || email?.split('@')[0] || '?').trim();
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts.at(-1)![0] : '')).toUpperCase();
}

/** `header` (workspace switcher) and `children` (user chip) stream in. */
export function AppSidebar({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  return (
    <Sidebar variant="inset">
      <SidebarHeader className="pt-3">{header}</SidebarHeader>
      <Nav />
      <SidebarFooter>{children}</SidebarFooter>
    </Sidebar>
  );
}
