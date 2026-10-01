import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Brand({ href = '/', small = false }: { href?: string; small?: boolean }) {
  return (
    <Link href={href} className={cn('flex w-fit items-center gap-2 px-1 py-0.5', small && 'gap-1.5 px-0')}>
      <Image src="/logo.png" alt="" width={128} height={128} priority className={cn('rounded-md', small ? 'size-5' : 'size-7')} />
      <span className={cn('font-mark font-semibold tracking-tight', small ? 'text-sm' : 'text-lg')}>Rekod</span>
    </Link>
  );
}
