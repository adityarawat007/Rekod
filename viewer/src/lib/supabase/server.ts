import { cache } from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/** Anon key only. RLS decides what this session can read — no service_role
 *  anywhere in this app, unlike the interim viewer.js it replaces.
 *
 *  cache()d per request: the layout, the page and any streamed section all call
 *  this, and without it each one re-reads cookies and builds a second client. */
export const supabaseServer = cache(async () => {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          // Fails inside a Server Component render; middleware refreshes instead.
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {}
        },
      },
    },
  );
});
