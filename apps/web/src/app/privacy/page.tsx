import type { Metadata } from 'next';
import { Brand } from '@/components/shell/brand';

/** The privacy policy the Chrome Web Store listing links to. Static and open
 *  (proxy.ts lets /privacy through without a cookie). Every claim here is a
 *  fact about apps/extension/ and apps/web/ — change the code, change this. */
export const metadata: Metadata = {
  title: 'Privacy policy · Rekod',
  description: 'What the Rekod extension and dashboard collect, when it leaves your browser, and how to delete it.',
};

const UPDATED = '12 October 2026';
const CONTACT = 'rawataditya795@gmail.com';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl text-ink">{title}</h2>
      {children}
    </section>
  );
}

export default function Privacy() {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b bg-panel">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 narrow:px-7">
          <Brand href="/" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-10 px-4 py-10 text-[15px] leading-relaxed text-muted-foreground narrow:px-7 [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-medium [&_strong]:text-ink">
        <div className="space-y-2">
          <h1 className="text-2xl text-ink">Privacy policy</h1>
          <p className="mono text-xs">Last updated {UPDATED}</p>
          <p>
            Rekod is a Chrome extension and a dashboard at rekody.vercel.app for filing bug reports: it records a
            browser tab, or takes a screenshot, together with what the page logged to its console and the network
            requests it made. This page says what that involves, plainly.
          </p>
        </div>

        <Section title="What stays in your browser">
          <p>
            To include the minutes <em>before</em> you press record, the extension runs on every page you open and
            keeps a rolling buffer of that page&apos;s activity <strong>in memory, on your computer</strong>: the last five
            minutes, then it is thrown away. Closing a tab discards its buffer. Nothing in it is written to disk or sent
            anywhere unless you start a capture.
          </p>
          <p>The buffer holds:</p>
          <ul>
            <li>console messages, uncaught errors and their stack traces;</li>
            <li>
              network requests made by the page (fetch, XHR, WebSocket and WebRTC data channels): URL, method, status,
              timing, headers the page can see, and request and response bodies, truncated;
            </li>
            <li>page navigations and resources that failed to load;</li>
            <li>
              basic environment details: browser and OS (user agent), page URL, window size, pixel ratio, graphics card
              name and the page&apos;s build tag if it publishes one.
            </li>
          </ul>
          <p>
            The extension does not record keystrokes, the values you type into forms, the page&apos;s HTML, your
            microphone, or sound from other tabs and apps.
          </p>
        </Section>

        <Section title="What is uploaded, and when">
          <p>
            Only when <strong>you start a capture</strong>, by clicking the extension or pressing its shortcut. When the
            recording stops (or the screenshot is cropped), the extension uploads to your Rekod dashboard:
          </p>
          <ul>
            <li>the video of that tab, with the sound that tab played (up to 3 minutes), or the screenshot, plus a still frame for the thumbnail;</li>
            <li>the console and network entries from the buffer and from the recording;</li>
            <li>the page URL and the environment details above;</li>
            <li>the title and description you type, when you save.</li>
          </ul>
          <p>
            Uploading starts when the capture stops, so it is ready by the time you finish writing. If you press
            Discard, the upload is deleted. If you close the composer without saving, the unsaved upload is deleted
            automatically within two days.
          </p>
        </Section>

        <Section title="Masking secrets, and its limits">
          <p>
            Before anything enters the buffer, the extension masks common credentials in your browser: authorization
            and cookie headers, API-key headers, fields and URL parameters with names like password, token, secret or
            key, bearer tokens, JWTs, and well-known API key formats. Email addresses in logs are partly masked.
          </p>
          <p>
            This is <strong>best effort</strong>. A secret with an unusual name, or personal information in a request
            body or console message, can still be captured. <strong>The video and screenshots are not redacted</strong>{' '}
            — they show exactly what was on screen. Look before you share a rekod.
          </p>
        </Section>

        <Section title="Your account and the session cookie">
          <p>
            You sign in to the dashboard with Google. We receive your name, email address and profile picture from
            Google, and use them to identify your account and workspace. The extension never asks for a password: it
            reads the dashboard&apos;s own sign-in cookie (rekod.session_token) and sends it only to that dashboard, to
            prove the upload is yours. It does not read any other site&apos;s cookies.
          </p>
          <p>
            The extension stores one setting on your computer (chrome.storage): where you last dragged its on-page
            control.
          </p>
        </Section>

        <Section title="Where it is stored, and who can see it">
          <ul>
            <li>
              Recordings, logs and screenshots are stored in a private storage bucket, and account and report records
              in a database, both hosted by Supabase (Seoul region). The dashboard runs on Vercel.
            </li>
            <li>A rekod is visible to the members of the workspace it was recorded in.</li>
            <li>
              Pressing Share creates a link that lets <strong>anyone who has it</strong> view that one rekod, without signing
              in. Stop sharing turns the link off.
            </li>
            <li>A comment shows its author&apos;s email address to everyone who can see the rekod, share links included.</li>
          </ul>
          <p>
            We do not sell your data, use it for advertising, or share it with anyone else. There are no analytics or
            tracking scripts in the extension or the dashboard.
          </p>
        </Section>

        <Section title="Keeping and deleting">
          <p>
            A rekod is kept until you delete it. Deleting removes its video, screenshot and logs from storage and its
            record from the database; it is not kept in a trash folder. To delete your account and everything in it,
            email {CONTACT}.
          </p>
        </Section>

        <Section title="Self-hosted instances">
          <p>
            Rekod can be self-hosted. If your organisation runs its own dashboard, your recordings go to that server and
            are governed by that organisation, not by this policy.
          </p>
        </Section>

        <Section title="Chrome Web Store User Data Policy">
          <p>
            The use of information received from Chrome extension APIs adheres to the{' '}
            <a
              className="text-ink underline underline-offset-4 hover:text-primary"
              href="https://developer.chrome.com/docs/webstore/program-policies/user-data-faq"
            >
              Chrome Web Store User Data Policy
            </a>
            , including the Limited Use requirements. Data is used only to provide Rekod&apos;s bug-reporting features.
          </p>
        </Section>

        <Section title="Children">
          <p>Rekod is a developer tool and is not directed at children under 13.</p>
        </Section>

        <Section title="Changes and contact">
          <p>
            If this policy changes, the date at the top changes with it. Questions or requests: {CONTACT}.
          </p>
        </Section>
      </main>
    </div>
  );
}
