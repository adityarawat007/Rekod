'use server';

import { z } from 'zod';
import { requireAdmin } from '@/lib/server/session';
import { setPlan } from '@/lib/server/reports';
import { deleteUser } from '@/lib/server/admin';
import { isPlan, type Plan } from '@/lib/plans';

// Public POST endpoints like every action: each re-checks the admin and
// validates its input. Refusals are returned, not thrown — Next hides a thrown
// action's message in production, and these messages are for the admin.

type Result = { ok: true } | { error: string };

const PlanInput = z.object({
  email: z.email(),
  plan: z.string().refine(isPlan, 'unknown plan'),
  videos: z.number().int().min(0).max(100_000),
});

export async function setUserPlan(input: z.input<typeof PlanInput>): Promise<Result> {
  await requireAdmin();
  const p = PlanInput.safeParse(input);
  if (!p.success) return { error: 'That plan or limit is not valid.' };
  return (await setPlan(p.data.email, p.data.plan as Plan, p.data.videos)) ? { ok: true } : { error: 'No such user.' };
}

export async function removeUser(userId: string): Promise<Result> {
  const a = await requireAdmin();
  const id = z.string().min(1).max(200).safeParse(userId);
  if (!id.success) return { error: 'No such user.' };
  const r = await deleteUser(a.userId, id.data);
  return 'refused' in r ? { error: r.refused } : { ok: true };
}
