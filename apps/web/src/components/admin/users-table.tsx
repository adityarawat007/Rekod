'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ago, bytes } from '@/lib/format';
import { PLANS, type Plan } from '@/lib/plans';
import { removeUser, setUserPlan } from '@/app/(dash)/admin/actions';
import type { AdminUser } from '@/lib/server/admin';

export type UserRow = Omit<AdminUser, 'createdAt' | 'lastAt'> & { createdAt: string; lastAt: string | null };

const SORTS = {
  new: ['Newest', (a: UserRow, b: UserRow) => b.createdAt.localeCompare(a.createdAt)],
  rekods: ['Most rekods', (a: UserRow, b: UserRow) => b.videos + b.screenshots - (a.videos + a.screenshots)],
  storage: ['Most storage', (a: UserRow, b: UserRow) => b.bytes - a.bytes],
  active: ['Last active', (a: UserRow, b: UserRow) => (b.lastAt ?? '').localeCompare(a.lastAt ?? '')],
} as const;
type Sort = keyof typeof SORTS;

export function UsersTable({ users, me }: { users: UserRow[]; me: string }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [doomed, setDoomed] = useState<UserRow | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users
      .filter((u) => !needle || u.email.toLowerCase().includes(needle) || u.name.toLowerCase().includes(needle))
      .sort(SORTS[sort][1]);
  }, [users, q, sort]);

  return (
    <section className="space-y-4 border bg-panel p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-semibold">Users <span className="mono text-xs font-normal text-muted-foreground">{users.length}</span></h2>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" aria-label="Search users" className="pl-9" />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="w-40 border-line-strong bg-panel" aria-label="Sort users">
            <SelectValue>{(v: Sort) => SORTS[v][0]}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            {(Object.keys(SORTS) as Sort[]).map((k) => <SelectItem key={k} value={k}>{SORTS[k][0]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Plan and video limit</TableHead>
            <TableHead className="text-right">Videos</TableHead>
            <TableHead className="text-right">Screenshots</TableHead>
            <TableHead className="text-right">Storage</TableHead>
            <TableHead className="text-right">Workspaces</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead>Last rekod</TableHead>
            <TableHead><span className="sr-only">Delete</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <Avatar className="size-7">
                    {u.image ? <AvatarImage src={u.image} alt="" referrerPolicy="no-referrer" /> : null}
                    <AvatarFallback className="bg-cell text-[10px] font-semibold">{(u.name || u.email)[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="max-w-[14rem] truncate font-medium">{u.name || '—'}</p>
                    <p className="mono max-w-[14rem] truncate text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell><PlanEditor user={u} /></TableCell>
              <TableCell className="text-right tabular-nums">
                {u.videos}<span className="text-muted-foreground"> / {u.videoLimit}</span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{u.screenshots}</TableCell>
              <TableCell className="mono text-right text-xs">{bytes(u.bytes)}</TableCell>
              <TableCell className="text-right tabular-nums">{u.owned}</TableCell>
              <TableCell className="mono text-xs text-muted-foreground" suppressHydrationWarning>{ago(u.createdAt)}</TableCell>
              <TableCell className="mono text-xs text-muted-foreground" suppressHydrationWarning>{u.lastAt ? ago(u.lastAt) : '—'}</TableCell>
              <TableCell>
                {u.id === me ? null : (
                  <Button variant="ghost" size="icon-xs" aria-label={`Delete ${u.email}`} title="Delete user" onClick={() => setDoomed(u)}>
                    <Trash2 className="text-error" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {!rows.length ? (
            <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">No user matches “{q}”.</TableCell></TableRow>
          ) : null}
        </TableBody>
      </Table>

      <DeleteDialog user={doomed} onClose={() => setDoomed(null)} />
    </section>
  );
}

/** Plan and limit, saved together. Picking a plan fills in its default limit;
 *  the number can then be set by hand, as `pnpm set-plan` allows. */
function PlanEditor({ user }: { user: UserRow }) {
  const router = useRouter();
  const [plan, setPlan] = useState(user.plan as Plan);
  const [limit, setLimit] = useState(String(user.videoLimit));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const videos = Number(limit);
  const valid = limit !== '' && Number.isInteger(videos) && videos >= 0 && videos <= 100_000;
  const dirty = plan !== user.plan || videos !== user.videoLimit;

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await setUserPlan({ email: user.email, plan, videos });
    setBusy(false);
    if ('error' in r) setErr(r.error);
    else router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={plan} onValueChange={(v) => { setPlan(v as Plan); setLimit(String(PLANS[v as Plan].videos)); }}>
        <SelectTrigger size="sm" className="w-20 border-line-strong bg-panel capitalize" aria-label={`Plan for ${user.email}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PLANS) as Plan[]).map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input
        value={limit}
        onChange={(e) => setLimit(e.target.value.replace(/\D/g, ''))}
        inputMode="numeric"
        aria-label={`Video limit for ${user.email}`}
        aria-invalid={!valid}
        className="h-8 w-20 tabular-nums"
      />
      {dirty ? (
        <Button size="sm" onClick={save} disabled={busy || !valid}>
          {busy ? <Loader2 className="animate-spin" /> : null} Save
        </Button>
      ) : null}
      {err ? <span role="alert" className="text-xs text-error">{err}</span> : null}
    </div>
  );
}

function DeleteDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function remove() {
    if (!user) return;
    setBusy(true);
    setErr(null);
    const r = await removeUser(user.id);
    setBusy(false);
    if ('error' in r) return setErr(r.error);
    onClose();
    router.refresh();
  }

  const n = user ? user.videos + user.screenshots : 0;
  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) { setErr(null); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {user?.email}?</DialogTitle>
          <DialogDescription>
            Their account, the {user?.owned === 1 ? 'workspace' : 'workspaces'} they own and everything in{' '}
            {user?.owned === 1 ? 'it' : 'them'} go — {n} {n === 1 ? 'rekod' : 'rekods'} with their files, logs, comments
            and share links ({user ? bytes(user.bytes) : ''}). They can sign up again with the same Google account, empty.
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {err ? <p role="alert" className="text-sm text-error">{err}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive-solid" onClick={remove} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
