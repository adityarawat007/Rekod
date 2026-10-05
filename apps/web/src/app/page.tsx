import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownToLine, ArrowUpRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Brand } from '@/components/shell/brand';
import { ThemeToggle } from '@/components/theme/toggle';
import { Dither } from '@/components/marketing/dither';
import { Reveal } from '@/components/marketing/motion';
import { Newsreader } from 'next/font/google';
import { cn } from '@/lib/utils';
// Written by `pnpm ext:zip` with public/rekod-extension.zip, from manifest.json.
import release from '@/lib/extension-release.json';

/** The public landing page. Static: it never reads the session or the
 *  database (proxy.ts lets `/` through without a cookie). Signed in or not,
 *  "Open dashboard" is a plain link to /rekod; the proxy sends a signed-out
 *  visitor on to /login. REKOD_DESIGN_SYSTEM.md "Landing page" has the rules.
 *  Few sections on purpose: hero, what it catches, install, footer. */

const SUB = 'Record any tab and rekod brings the five minutes before it, so nobody has to ask what happened.';

export const metadata: Metadata = {
  title: 'rekod: every report arrives with its backstory',
  description: SUB,
};

const ZIP = '/rekod-extension.zip';
const README = '/rekod-extension-README.txt';
const kb = Math.round(release.bytes / 1024);
const WRAP = 'mx-auto w-full max-w-[1200px] px-4 narrow:px-7';
// Headings only, and only on this page: a crisp display serif, the free
// stand-in for the commercial Flecha the brief pointed at. Emphasis is the
// same family's italic, never a second face. Body stays Inter Tight.
const serif = Newsreader({ subsets: ['latin'], axes: ['opsz'], style: ['normal', 'italic'], variable: '--font-display' });
const DISPLAY = 'font-[family-name:var(--font-display)] font-normal tracking-[-0.025em] text-ink [font-variation-settings:"opsz"_72]';

function Download({ onDusk = false }: { onDusk?: boolean }) {
  return (
    <a
      href={ZIP}
      download
      className={cn(
        buttonVariants({ size: 'lg', variant: onDusk ? 'outline' : 'default' }),
        'h-11 px-5 text-[15px] active:translate-y-px',
        onDusk && 'border-panel hover:bg-tint-soft',
      )}
    >
      <ArrowDownToLine /> Download the extension
    </a>
  );
}

function OpenDashboard({ big = false }: { big?: boolean }) {
  return (
    <Link href="/rekod" className={cn(buttonVariants({ size: 'lg', variant: 'outline' }), big && 'h-11 px-5 text-[15px]')}>
      Open dashboard <ArrowUpRight />
    </Link>
  );
}

export default function Landing() {
  return (
    <div className={cn(serif.variable, 'min-h-dvh bg-background')}>
      <header className="border-b bg-panel">
        <div className={cn(WRAP, 'flex h-16 items-center gap-6')}>
          <Brand href="/" />
          <nav aria-label="Page" className="ml-auto hidden items-center gap-6 font-medium text-muted-foreground narrow:flex">
            <a href="#install" className="flex h-[38px] items-center hover:text-ink">Install</a>
            <a href="#self-host" className="flex h-[38px] items-center hover:text-ink">Self-host</a>
          </nav>
          <div className="ml-auto flex items-center gap-2 narrow:ml-0">
            <ThemeToggle />
            <OpenDashboard />
          </div>
        </div>
      </header>

      <main className="overflow-x-clip">
        {/* Hero: the peak as a two-colour dither, full bleed, with the words on
            a solid panel so they never sit on the pixels. */}
        <section className="relative isolate flex min-h-[calc(100dvh-4rem)] items-start">
          {/* Still: no animation, no hover effect. */}
          <Dither src="/dither/peak.jpg" focus={[0.5, 0.3]} className="absolute inset-0 -z-10" />
          {/* Click-through, so the picture behind gets the pointer; the panel takes it back. */}
          <div className={cn(WRAP, 'pointer-events-none pb-48 pt-6 narrow:pb-64 narrow:pt-12')}>
            <div className="pointer-events-auto max-w-[46rem] space-y-6 border border-line bg-panel p-6 narrow:p-10">
              {/* leading 1.1 and pb-1: the italic line keeps its descenders. */}
              <h1 className={cn(DISPLAY, 'pb-1 text-[44px] leading-[1.1] narrow:text-[72px]')}>
                Every report arrives <em>with its backstory.</em>
              </h1>
              <p className="max-w-[48ch] text-[17px] leading-[26px] text-muted-foreground narrow:text-[19px] narrow:leading-[29px]">{SUB}</p>
              <div className="flex flex-wrap gap-3 pt-1">
                <Download />
                <OpenDashboard big />
              </div>
            </div>
          </div>
        </section>

        <Catches />

        <Sharing />

        <Install />
      </main>

      <Footer />
    </div>
  );
}

// ── What it catches: the product, in plain words, beside a dithered photo ──

const CATCHES = [
  ['Already rolling', 'It keeps the last five minutes, so the moment you missed is already on tape.'],
  ['One shortcut', 'Press it on any tab. No setup per site, no recording to remember to start.'],
  ['The whole story', 'What was on screen and what the page was doing, side by side on one timeline.'],
  ['Private by default', 'Passwords and tokens are scrubbed in your browser before anything is uploaded.'],
] as const;

function Catches() {
  return (
    <section className={cn(WRAP, 'grid grid-cols-[minmax(0,1fr)] items-center gap-12 py-16 narrow:py-24 wide:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] wide:gap-16')}>
      <Reveal className="mx-auto w-full max-w-[440px] wide:max-w-none">
        <Dither src="/dither/bridge-walker.jpg" focus={[0.5, 0.55]} className="aspect-square w-full border border-line" />
      </Reveal>
      <Reveal delay={0.1} className="space-y-10">
        <h2 className={cn(DISPLAY, 'pb-1 text-[38px] leading-[1.1] narrow:text-[54px]')}>
          Press record after it happens. <em>It already has it.</em>
        </h2>
        <dl className="grid gap-x-10 gap-y-8 narrow:grid-cols-2">
          {CATCHES.map(([k, v]) => (
            <div key={k} className="space-y-2 border-t border-ink pt-4">
              <dt className="text-[17px] font-semibold text-ink">{k}</dt>
              <dd className="text-[15px] leading-[23px] text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </section>
  );
}

// ── Sharing: words left, a sailboat right (mirrors Catches) ───────────────

const AUDIENCES = [
  ['For your engineers', 'The recording with everything the page did, ready to dig into.'],
  ['For everyone else', 'Just the video. Clear, short, nothing to decode.'],
] as const;

function Sharing() {
  return (
    <section className="border-y bg-panel">
      <div className={cn(WRAP, 'grid grid-cols-[minmax(0,1fr)] items-center gap-12 py-16 narrow:py-24 wide:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] wide:gap-16')}>
        <Reveal className="space-y-8">
          <h2 className={cn(DISPLAY, 'pb-1 text-[38px] leading-[1.1] narrow:text-[54px]')}>
            Send it to anyone. <em>Take it back whenever.</em>
          </h2>
          <p className="max-w-[48ch] text-[17px] leading-[27px] text-muted-foreground">
            Share one link with your team, a client or a vendor. They watch it in the browser with no account. Stop sharing and the link goes dead.
          </p>
          <dl className="border-t border-ink">
            {AUDIENCES.map(([who, what]) => (
              <div key={who} className="grid gap-1 border-b py-5 narrow:grid-cols-[12rem_minmax(0,1fr)] narrow:gap-6">
                <dt className="text-[16px] font-semibold text-ink">{who}</dt>
                <dd className="text-[15px] leading-[23px] text-muted-foreground">{what}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
        <Reveal delay={0.1} className="mx-auto w-full max-w-[440px] wide:max-w-none">
          <Dither src="/dither/sailboat.jpg" focus={[0.5, 0.6]} className="aspect-[4/5] w-full border border-line" />
        </Reveal>
      </div>
    </section>
  );
}

// ── Install ───────────────────────────────────────────────────────────────

const Code = ({ children }: { children: React.ReactNode }) => <code className="mono text-[13px] text-ink">{children}</code>;

const STEPS: React.ReactNode[] = [
  <>Unzip it and keep the <Code>rekod-extension</Code> folder somewhere permanent.</>,
  <>Open <Code>chrome://extensions</Code> and turn on Developer mode.</>,
  <>Click Load unpacked and pick that folder.</>,
  <>Pin rekod, then sign in on the dashboard. The extension uses that session.</>,
  <>On any page, press <Code>⌥⇧J</Code> to record.</>,
];

function Install() {
  return (
    <section id="install" className="relative scroll-mt-4 bg-chrome">
      {/* Two columns: the dusk fills the band and the text sits over its
          midnight end (§2.4). Stacked, the text would run onto the pink, so
          the band is solid midnight under a dusk strip instead. */}
      <div aria-hidden className="bg-electric-wide h-6 wide:absolute wide:inset-0 wide:h-auto" />
      <div className={cn(WRAP, 'relative grid grid-cols-[minmax(0,1fr)] items-center gap-12 py-20 narrow:py-28 wide:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')}>
        <Reveal className="space-y-6 text-on-chrome">
          <h2 className={cn(DISPLAY, 'pb-1 text-[48px] leading-[1.05] text-on-chrome narrow:text-[76px]')}>
            Install it <em>in Chrome.</em>
          </h2>
          <Download onDusk />
          <p className="mono text-xs text-on-chrome-muted">
            Version {release.version}, a {kb} KB zip
          </p>
          <p id="self-host" className="max-w-[44ch] scroll-mt-4 border-t border-on-chrome/20 pt-6 text-[15px] leading-[24px] text-on-chrome-muted">
            Running your own? The backend is one Next.js app on any Postgres and any S3-compatible bucket.{' '}
            <a href={README} className="font-medium text-on-chrome underline underline-offset-4">
              The README
            </a>{' '}
            says what to point where.
          </p>
        </Reveal>

        <Reveal delay={0.1} className="relative">
          <div aria-hidden className="absolute inset-0 translate-x-3 translate-y-3 bg-chrome" />
          <ol className="relative space-y-5 border border-ink bg-panel p-6 narrow:p-8">
            {STEPS.map((s, i) => (
              <li key={i} className="flex gap-4 text-[15px] leading-[22px] text-muted-foreground">
                <span className="mono w-5 shrink-0 font-medium text-primary">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="bg-chrome">
      {/* A second dithered photo, still, then the text on midnight so nothing
          is read off the pixels. */}
      <Dither src="/dither/hills.jpg" focus={[0.5, 0.45]} className="h-40 narrow:h-56" />
      <div className={cn(WRAP, 'flex flex-col gap-6 py-10 narrow:flex-row narrow:items-center narrow:justify-between')}>
        <Brand href="/" className="text-on-chrome" />
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-1 font-medium text-on-chrome">
          <a href={ZIP} download className="flex h-8 items-center underline-offset-4 hover:underline">Download the extension</a>
          <Link href="/rekod" className="flex h-8 items-center underline-offset-4 hover:underline">Open dashboard</Link>
          <a href={README} className="flex h-8 items-center underline-offset-4 hover:underline">README</a>
        </nav>
      </div>
    </footer>
  );
}
