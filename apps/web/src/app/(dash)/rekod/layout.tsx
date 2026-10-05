import { PanelFrame } from '@/components/shell/panel-frame';
import { AppHeader } from '@/components/shell/app-header';

// Not async: the shell needs no data, so it paints before the first query.
export default function DashLayout({ children }: LayoutProps<'/rekod'>) {
  return (
    <PanelFrame>
      <AppHeader />
      <main className="min-w-0 flex-1">{children}</main>
    </PanelFrame>
  );
}
