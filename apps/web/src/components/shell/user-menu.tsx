'use client';

import { LogOut } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type NavUser = {
  email: string | null;
  name?: string | null;
  /** The Google profile picture. */
  image?: string | null;
};

/** "Aditya Rawat" and "aditya.rawat" both → AR. */
function initials(name?: string | null, email?: string | null) {
  const src = (name || email?.split('@')[0] || '?').trim();
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts.at(-1)![0] : '')).toUpperCase();
}

export function UserMenu({ email, name, image }: NavUser) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account"
        className="grid size-[38px] place-items-center rounded-full outline-none"
      >
        <Avatar className="size-8">
          {/* Google's avatar host refuses some requests that carry a Referer. */}
          {image ? <AvatarImage src={image} alt="" referrerPolicy="no-referrer" /> : null}
          <AvatarFallback className="bg-cell text-[11px] font-semibold text-ink">{initials(name, email)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-64 p-1">
        <div className="px-2 py-2">
          {name ? <p className="truncate font-medium text-ink">{name}</p> : null}
          <p className="mono truncate text-xs text-muted-foreground">{email ?? 'signed in'}</p>
        </div>
        <DropdownMenuSeparator />
        <form action="/auth/signout" method="post">
          <DropdownMenuItem render={<button type="submit" className="w-full" />} className="gap-2.5 py-2">
            <LogOut /> Log out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
