import type { Metadata } from 'next';
import { IBM_Plex_Mono, Inter_Tight } from 'next/font/google';
import { ThemeProvider } from '@/components/theme/provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

// §3: sans for work, mono for machine.
const sans = Inter_Tight({ variable: '--font-inter-tight', subsets: ['latin'], weight: ['300', '400', '500', '600', '700'] });
const mono = IBM_Plex_Mono({ variable: '--font-plex-mono', subsets: ['latin'], weight: ['400', '500'] });

export const metadata: Metadata = {
  title: 'rekod',
  description: 'Your own bug reports, captured from the browser.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider>
          <TooltipProvider delay={200}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
