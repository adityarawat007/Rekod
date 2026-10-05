'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Check, ChevronDown, Loader2, Lock, Plus } from 'lucide-react';
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
import type { Workspace } from '@/lib/server/workspaces';
import type { Plan } from '@/lib/plans';
import { cn } from '@/lib/utils';

function Tile({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-6 shrink-0 place-items-center bg-tint-soft text-[11px] font-semibold text-primary',
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
    <>
      <DropdownMenu>
        {/* §6.3 select chip: KEY, value, ▾. */}
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="flex h-[38px] max-w-64 items-center gap-2 border border-line-strong bg-bg px-3 text-muted-foreground transition-colors duration-150 hover:bg-tint-soft data-popup-open:border-ink data-popup-open:bg-panel data-popup-open:text-ink"
            />
          }
        >
          <span className="label font-normal text-faint">Workspace</span>
          <span className="min-w-0 truncate font-medium text-ink">{name}</span>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <ChevronDown className="size-4" />}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={6} className="w-72 p-1">
          <div className="flex items-center gap-3 px-2 py-2">
            <Tile name={name} className="size-9 text-sm" />
            <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
            <span className="label border border-line-strong px-1.5 text-muted-foreground">{plan}</span>
          </div>
          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2.5 py-2">
              <ArrowLeftRight /> Switch workspace
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-60 p-1">
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
                <span className="grid size-6 place-items-center border border-dashed border-line-strong">
                  {canCreate ? <Plus className="size-3.5" /> : <Lock className="size-3.5" />}
                </span>
                <span className="flex-1">New workspace</span>
                {canCreate ? null : <span className="label bg-pink px-1.5 text-on-pink">Pro</span>}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewWorkspace open={open} onOpenChange={setOpen} />
    </>
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
              A separate place for a team&apos;s rekods. You can switch between workspaces from the header.
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
          {err ? <p role="alert" className="text-sm text-error">{err}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
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
