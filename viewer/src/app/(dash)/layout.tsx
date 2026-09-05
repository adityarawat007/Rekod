import { Suspense } from 'react';
import { AppSidebar, AppSidebarSkeleton } from '@/components/app-sidebar';
import { SidebarNav } from '@/components/sidebar-nav';
import { Brand } from '@/components/brand';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';

// Not async on purpose. proxy.ts already proved there is a session and RLS
// scopes every row below to it, so the shell needs no data of its own and
// paints before the first query returns.
export default function DashLayout({ children }: LayoutProps<'/'>) {
  return (
    <SidebarProvider>
      <AppSidebar>
        <Suspense fallback={<AppSidebarSkeleton />}>
          <SidebarNav />
        </Suspense>
      </AppSidebar>

      <SidebarInset>
        <header className="flex items-center gap-2 border-b bg-background/80 px-4 py-3 backdrop-blur md:hidden">
          <SidebarTrigger aria-label="Open navigation" />
          <Brand />
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
