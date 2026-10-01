import type { Metadata } from 'next';
import { Inter, Roboto_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/theme/provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

// Inter's metrics are adjusted against this fallback stack while it loads.
const sans = Inter({
  variable: '--font-body',
  subsets: ['latin'],
  fallback: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'],
});
const data = Roboto_Mono({ variable: '--font-data', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Rekod',
  description: 'Your own bug reports, captured from the browser.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${data.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider>
          <TooltipProvider delay={200}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
