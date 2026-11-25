import { Suspense } from 'react';
import { requireAdmin } from '@/lib/server/session';
import { adminDaily, adminSites, adminStats, adminUsers } from '@/lib/server/admin';
import { AdminSkeleton } from '@/components/skeletons';
import { DayBars, SiteBars, StatTiles, StorageBars } from '@/components/admin/overview';
import { UsersTable } from '@/components/admin/users-table';

// A static shell and one Suspense'd child: the gate and the four reads run
// together inside it, so nothing about the page shows before the check.
export default function AdminPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Admin />
    </Suspense>
  );
}

async function Admin() {
  const me = await requireAdmin();
  const [stats, users, daily, sites] = await Promise.all([adminStats(), adminUsers(), adminDaily(30), adminSites(10)]);
  return (
    <div className="space-y-7 p-4 narrow:p-7">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <StatTiles stats={stats} />
      <div className="grid gap-5 narrow:grid-cols-2">
        <DayBars title="Rekods per day" unit="rekod" days={daily.map((d) => ({ day: d.day, n: d.rekods }))} />
        <DayBars title="Sign-ups per day" unit="sign-up" days={daily.map((d) => ({ day: d.day, n: d.signups }))} />
      </div>
      <div className="grid gap-5 narrow:grid-cols-2">
        <StorageBars stats={stats} />
        <SiteBars sites={sites} />
      </div>
      <UsersTable
        me={me.userId}
        users={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString(), lastAt: u.lastAt?.toISOString() ?? null }))}
      />
    </div>
  );
}
