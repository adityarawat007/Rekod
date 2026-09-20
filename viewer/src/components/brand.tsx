import Link from 'next/link';

export function Brand({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 px-1 py-0.5">
      <span className="font-heading text-lg font-extrabold tracking-tight">ReKod</span>
    </Link>
  );
}
