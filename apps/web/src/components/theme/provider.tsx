'use client';

import { ThemeProvider as NextThemes } from 'next-themes';

/** §9: follows the system, with a manual override (ThemeToggle) kept per
 *  browser. `data-theme` is the attribute the tokens in globals.css key on. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
