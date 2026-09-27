import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/server/auth';

// Both Sign out buttons POST here as a plain form, so it works before hydration.
export async function POST(req: NextRequest) {
  const res = await auth().api.signOut({ headers: req.headers, asResponse: true });
  const out = NextResponse.redirect(new URL('/login', req.url), { status: 303 });
  // Carry Better Auth's cookie deletions onto the redirect.
  for (const c of res.headers.getSetCookie()) out.headers.append('set-cookie', c);
  return out;
}
