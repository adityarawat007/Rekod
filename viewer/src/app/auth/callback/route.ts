import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/';
  const fail = (why: string) => NextResponse.redirect(`${origin}/login?error=${why}`);

  if (!code) return fail('exchange');

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return fail('exchange');

  // Any email may hold a session. Whether it may READ is the allowlist's call,
  // enforced by RLS and surfaced by the dashboard layout — not here.
  return NextResponse.redirect(`${origin}${next.startsWith('/') ? next : '/'}`);
}
