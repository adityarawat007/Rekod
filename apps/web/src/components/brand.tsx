import Image from 'next/image';
import Link from 'next/link';

export function Brand({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 px-1 py-0.5">
      {/* ponytail: the badge ships with its own off-white plate, so it needs no
          theme handling — only the text follows the theme. */}
      <Image src="/logo.png" alt="" width={128} height={128} priority className="size-7 rounded-md" />
      <span className="font-mark text-xl font-medium tracking-tight">Rekod</span>
    </Link>
  );
}
