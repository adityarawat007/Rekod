import type { Metadata } from 'next';
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono, Roboto } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

const display = Bricolage_Grotesque({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['400', '600', '800'],
});
const body = Instrument_Sans({ variable: '--font-body', subsets: ['latin'] });
const data = JetBrains_Mono({ variable: '--font-data', subsets: ['latin'] });
/** The wordmark only. */
const mark = Roboto({ variable: '--font-logo', subsets: ['latin'], weight: ['500'] });

export const metadata: Metadata = {
  title: 'ReKod',
  description: 'Your own bug reports, captured from the browser.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${data.variable} ${mark.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider>
          <TooltipProvider delay={200}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
