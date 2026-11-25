import { PanelFrame } from '@/components/shell/panel-frame';
import { AppHeader } from '@/components/shell/app-header';

// The same shell as /rekod: the header needs no data, so it paints first.
export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <PanelFrame>
      <AppHeader />
      <main className="min-w-0 flex-1">{children}</main>
    </PanelFrame>
  );
}
