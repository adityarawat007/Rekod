'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const OPTIONS = [
  { v: 'light', Icon: Sun, label: 'Light' },
  { v: 'dark', Icon: Moon, label: 'Dark' },
  { v: 'system', Icon: Monitor, label: 'System' },
] as const;

// "Hydrated yet?" without a setState-in-effect.
const NEVER = () => () => {};
const useHydrated = () => useSyncExternalStore(NEVER, () => true, () => false);

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const ready = useHydrated();

  return (
    <ToggleGroup
      size="sm"
      value={ready && theme ? [theme] : []}
      onValueChange={(v) => v.length && setTheme(v[v.length - 1])}
      className="w-full"
    >
      {OPTIONS.map(({ v, Icon, label }) => (
        <ToggleGroupItem key={v} value={v} aria-label={label} className="flex-1">
          <Icon className="size-4" />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
