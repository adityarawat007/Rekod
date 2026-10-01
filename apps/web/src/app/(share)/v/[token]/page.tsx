import { SharedReport, sharedMetadata } from '../../shared';

export async function generateMetadata(props: PageProps<'/v/[token]'>) {
  return sharedMetadata((await props.params).token, false);
}

export default async function Page(props: PageProps<'/v/[token]'>) {
  return <SharedReport token={(await props.params).token} withLogs={false} />;
}
