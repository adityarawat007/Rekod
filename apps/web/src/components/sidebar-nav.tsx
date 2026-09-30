import { cache } from 'react';
import { currentUser } from '@/lib/server/session';
import { SidebarUser } from '@/components/app-sidebar';

/** The signed-in person, from Better Auth's signed cookie cache — no database
 *  round trip, so the chip fills in almost with the shell. cache()d so the
 *  report page asking for the email costs nothing. */
export const navData = cache(async () => {
  const u = await currentUser();
  return { email: u?.email ?? null, name: u?.name, image: u?.image };
});

/** Streams into the sidebar footer. requireActor() on the page is the real
 *  check; a missing session here just renders the fallback label. */
export async function SidebarNav() {
  return <SidebarUser {...await navData()} />;
}
