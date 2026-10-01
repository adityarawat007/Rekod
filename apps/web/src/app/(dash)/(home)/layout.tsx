import { Suspense } from 'react';
import { AppSidebar, SidebarUserSkeleton, SidebarWorkspaceSkeleton } from '@/components/shell/app-sidebar';
import { SidebarNav, SidebarWorkspace } from '@/components/shell/sidebar-nav';
import { Brand } from '@/components/shell/brand';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';

// Not async: the shell needs no data, so it paints before the first query.
export default function DashLayout({ children }: LayoutProps<'/'>) {
  return (
    <SidebarProvider>
      <AppSidebar
        header={
          <Suspense fallback={<SidebarWorkspaceSkeleton />}>
            <SidebarWorkspace />
          </Suspense>
        }
      >
        <Suspense fallback={<SidebarUserSkeleton />}>
          <SidebarNav />
        </Suspense>
      </AppSidebar>

      <SidebarInset className="md:border md:peer-data-[variant=inset]:shadow-none">
        <header className="flex items-center gap-2 border-b px-4 py-3 md:hidden">
          <SidebarTrigger aria-label="Open navigation" />
          <Brand />
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
