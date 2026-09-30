'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Inbox, LogOut } from 'lucide-react';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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

/** Shown while the session is read. Same height as the chip, so nothing jumps. */
export function SidebarUserSkeleton() {
  return <div className="h-[46px] rounded-md border bg-card/50" />;
}

// Static on purpose: it needs no data, so it paints with the shell. The old
// per-host "Projects" list cost two sequential queries on every page and grew a
// row per localhost port; the grid's site filter does that job.
function Nav() {
  const path = usePathname();
  return (
    <SidebarContent>
      <SidebarGroup>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton isActive={path === '/'} render={<Link href="/" />}>
            <Inbox />
            <span>All ReKods</span>
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
      {/* Light only for now — ThemeProvider forces it, so a toggle here would
          be three buttons that do nothing. Uncomment with the `forcedTheme`
          prop in theme-provider.tsx. */}
      {/* <ThemeToggle /> */}
      <div className="flex items-center gap-2 rounded-md border bg-card/50 p-2">
        <Avatar size="sm">
          {/* no-referrer: Google's avatar host refuses some requests that
              carry a Referer. A failed load shows the fallback, not a hole. */}
          {image ? <AvatarImage src={image} alt="" referrerPolicy="no-referrer" /> : null}
          <AvatarFallback className="bg-grape/10 font-medium text-grape">{initials(name, email)}</AvatarFallback>
        </Avatar>
        <p className="min-w-0 flex-1 truncate text-xs font-medium">{email ?? 'signed in'}</p>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out">
            <LogOut />
          </Button>
        </form>
      </div>
    </>
  );
}

/** Up to two letters: "Aditya Rawat" → AR. An email-signup name is the local
 *  part (see sign-in.tsx), so "aditya.rawat" → AR too, by splitting on . _ - */
function initials(name?: string | null, email?: string | null) {
  const src = (name || email?.split('@')[0] || '?').trim();
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts.at(-1)![0] : '')).toUpperCase();
}

/** The chrome and the nav, rendered instantly. `children` is the user chip,
 *  which streams. */
export function AppSidebar({ children }: { children: React.ReactNode }) {
  return (
    <Sidebar>
      <SidebarHeader>
        <Brand />
      </SidebarHeader>
      <Nav />
      <SidebarFooter>{children}</SidebarFooter>
    </Sidebar>
  );
}
