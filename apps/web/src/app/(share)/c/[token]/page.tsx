import { SharedReport, sharedMetadata } from '../../shared';

export async function generateMetadata(props: PageProps<'/c/[token]'>) {
  return sharedMetadata((await props.params).token, true);
}

export default async function Page(props: PageProps<'/c/[token]'>) {
  return <SharedReport token={(await props.params).token} withLogs={true} />;
}
