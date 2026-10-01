import { permanentRedirect } from 'next/navigation';

/** Links copied before 1 Oct 2026: /s/<token>[?view=media]. */
export default async function LegacyShare(props: PageProps<'/s/[token]'>) {
  const [{ token }, { view }] = await Promise.all([props.params, props.searchParams]);
  permanentRedirect(`/${view === 'media' ? 'v' : 'c'}/${token}`);
}
