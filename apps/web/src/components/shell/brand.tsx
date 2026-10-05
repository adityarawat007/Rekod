import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/** §3 wordmark: the pixel star (public/rekod-mark.svg, made by scripts/mark.mjs), then "rekod", sans 700,
 *  lowercase. Inside the app it goes to the grid (/rekod); the landing page,
 *  the login page and share links point it at the landing page (/).
 *  `className` recolours the word. */
export function Brand({
  href = '/rekod',
  small = false,
  className,
}: {
  href?: string;
  small?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={href === '/' ? 'rekod home' : 'rekod, all rekods'}
      className={cn('flex w-fit shrink-0 items-center', small ? 'gap-1.5' : 'gap-2')}
    >
      <Image src="/rekod-mark.svg" alt="" width={22} height={22} unoptimized className={small ? 'size-[18px]' : 'size-[22px]'} />
      <span className={cn('font-bold tracking-[-0.02em] text-ink', small ? 'text-lg' : 'text-[22px]', className)}>rekod</span>
    </Link>
  );
}
