'use client';

import { ThemeProvider as NextThemes } from 'next-themes';

/**
 * Light only, for now.
 *
 * `forcedTheme` is the whole switch: the `.dark` block in globals.css and the
 * toggle in the sidebar are both still here, they just never apply. Bring dark
 * back by dropping the prop and uncommenting `<ThemeToggle />` in
 * `app-sidebar.tsx` — the palette was validated, not eyeballed, and re-deriving
 * it is the expensive part.
 */
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
