'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Check, ChevronDown, Loader2, Lock, LogOut, Plus } from 'lucide-react';
import { createWorkspace, switchWorkspace } from '@/app/(dash)/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import type { Workspace } from '@/lib/server/workspaces';
import type { Plan } from '@/lib/plans';
import { cn } from '@/lib/utils';

function Tile({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-md bg-link/10 text-[11px] font-semibold text-link',
        className,
      )}
    >
      {name.trim()[0]?.toUpperCase() ?? '?'}
    </span>
  );
}

export function WorkspaceSwitcher({
  workspaces,
  active,
  plan,
  canCreate,
}: {
  workspaces: Workspace[];
  active: string;
  plan: Plan;
  /** False when the plan has no room. The server re-checks. */
  canCreate: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const current = workspaces.find((w) => w.id === active) ?? workspaces[0];
  const name = current?.name ?? 'Workspace';

  const switchTo = (id: string) =>
    start(async () => {
      await switchWorkspace(id);
      router.refresh();
    });

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="gap-2.5 px-2 data-popup-open:bg-sidebar-accent" />}
          >
            <Tile name={name} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{name}</span>
            {pending ? (
              <Loader2 className="animate-spin text-muted-foreground" />
            ) : (
              <ChevronDown className="text-muted-foreground" />
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" sideOffset={6} className="w-72 p-1.5">
            <div className="flex items-center gap-3 px-2 py-2">
              <Tile name={name} className="size-9 text-sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
              <span className="rounded-md border px-1.5 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                {plan}
              </span>
            </div>
            <DropdownMenuSeparator />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2.5 py-2">
                <ArrowLeftRight /> Switch workspace
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-60 p-1.5">
                {workspaces.map((w) => (
                  <DropdownMenuItem
                    key={w.id}
                    onClick={() => w.id !== current?.id && switchTo(w.id)}
                    className="gap-2.5 py-2"
                  >
                    <Tile name={w.name} className="size-6 text-[11px]" />
                    <span className="min-w-0 flex-1 truncate">{w.name}</span>
                    {w.id === current?.id ? <Check /> : null}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!canCreate} onClick={() => setOpen(true)} className="gap-2.5 py-2">
                  <span className="grid size-6 place-items-center rounded-md border border-dashed">
                    {canCreate ? <Plus className="size-3.5" /> : <Lock className="size-3.5" />}
                  </span>
                  <span className="flex-1">New workspace</span>
                  {canCreate ? null : (
                    <span className="rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">
                      PRO
                    </span>
                  )}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />

            <form action="/auth/signout" method="post">
              <DropdownMenuItem render={<button type="submit" className="w-full" />} className="gap-2.5 py-2">
                <LogOut /> Log out
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
        <NewWorkspace open={open} onOpenChange={setOpen} />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function NewWorkspace({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    start(async () => {
      try {
        const r = await createWorkspace(name);
        if ('refused' in r) return setErr(r.message);
        setName('');
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>
              A separate place for a team&apos;s Rekods. You can switch between workspaces from the sidebar.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme engineering"
            maxLength={80}
            aria-label="Workspace name"
          />
          {err ? <p role="alert" className="text-sm text-destructive">{err}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Create workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
