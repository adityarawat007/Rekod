'use client';

import { ThemeProvider as NextThemes } from 'next-themes';

/** Light only: `forcedTheme` is the switch. Drop it and uncomment
 *  `<ThemeToggle />` in shell/app-sidebar.tsx; the `.dark` palette is kept. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes
      attribute="class"
      forcedTheme="light"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemes>
  );
}
