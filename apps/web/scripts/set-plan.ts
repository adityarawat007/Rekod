// pnpm set-plan <email> <plan> [videos]
// Moves a user to a plan (lib/plans.ts), with that plan's video limit unless
// one is given — `pnpm set-plan a@b.com free 50` is a free user allowed 50.
import { isPlan, PLANS } from '../src/lib/plans.ts';
import { setPlan } from '../src/lib/server/reports.ts';

const [email, plan, videos] = process.argv.slice(2);
if (!email || !plan || !isPlan(plan) || (videos !== undefined && !/^\d+$/.test(videos))) {
  console.error(`usage: pnpm set-plan <email> <${Object.keys(PLANS).join('|')}> [videos]`);
  process.exit(1);
}
if (!(await setPlan(email, plan, videos === undefined ? undefined : Number(videos)))) {
  console.error(`no user ${email}`);
  process.exit(1);
}
console.log(`${email}: ${plan}, ${videos ?? PLANS[plan].videos} videos`);
process.exit(0);
