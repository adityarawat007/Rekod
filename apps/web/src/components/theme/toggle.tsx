'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

// "Hydrated yet?" without a setState-in-effect.
const NEVER = () => () => {};
const useHydrated = () => useSyncExternalStore(NEVER, () => true, () => false);

/** §6.1: 38×38, 1px border. Follows the system until clicked; the choice is
 *  then kept per browser (next-themes' localStorage). */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = useHydrated() && resolvedTheme === 'dark';
  return (
    <Button
      variant="outline"
      size="icon-lg"
      className={className}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
