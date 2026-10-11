# Publishing ReKod to the Chrome Web Store

Everything the Developer Dashboard asks for, ready to paste. The store build
talks to production only: `https://rekody.vercel.app` (Supabase Postgres +
Supabase Storage). `http://localhost` stays for people running the dashboard
themselves.

## 1. Before you submit (blocking)

- [ ] **Deploy the privacy policy.** Merge this branch so
      `https://rekody.vercel.app/privacy` loads without signing in. The listing
      is rejected if the URL 404s or asks for a login.
- [ ] **Let reviewers sign in.** They will sign in with their own Google account.
      In Vercel, production must have `DISABLE_SIGNUP` unset/false and
      `ALLOWED_EMAIL_DOMAINS` empty — otherwise they cannot test anything and the
      submission is rejected as "not functional".
- [ ] **Developer account.** chrome.google.com/webstore/devconsole — one-time
      US$5 fee, 2-step verification on the Google account, a verified contact
      email, and the trader / non-trader declaration (EU). **Non-trader** while
      ReKod is free and earns nothing (no public address or phone on the
      listing; EU users see a "not a trader" notice). **Switch to trader** the day
      paid plans or any monetisation go live, or if it is run as a business.
- [ ] **Real screenshots** (see §3). The generated ones are a start, not enough.
- [ ] Check the contact email in `apps/web/src/app/privacy/page.tsx` (`CONTACT`)
      is the one you want public.

## 2. The package

```
pnpm ext:store          # → ~/Desktop/rekod-<version>-chrome-web-store.zip
```

`manifest.json` sits at the zip's root (the store refuses a nested folder);
`pnpm ext:zip` is still the Load-unpacked download the landing page serves.
Every later upload needs a higher `version` in `apps/extension/manifest.json`.

## 3. Store listing tab

**Name:** ReKod (from the manifest)

**Summary** (manifest description, 106 chars):
> Record a tab with the last 5 minutes of console and network already captured, and send it as a bug report.

**Description:**
> ReKod turns "it broke, I don't know what I did" into a report a developer can act on.
>
> Press the shortcut (Alt+Shift+J) or click the extension on any tab. ReKod records the tab — and the console messages and network requests from the five minutes *before* you pressed record are already included, so the moment you missed is on tape.
>
> Your report opens on the ReKod dashboard with the video and a DevTools-style pane on one timeline: console errors, failed requests with headers and bodies, page and browser details. Share it with a link, or copy it as Markdown into GitHub, Linear or Jira.
>
> • Video or screenshot, with console + network on one timeline
> • The 5 minutes before recording, buffered locally in your browser
> • Passwords, tokens, API keys and auth headers masked in your browser before upload
> • Nothing leaves your browser until you capture — and Discard deletes it
> • Open source and self-hostable (Postgres or MongoDB, any S3-compatible bucket)
>
> Requires a free ReKod account (sign in with Google at rekody.vercel.app).

**Category:** Developer Tools · **Language:** English

**Images** (`~/Desktop/rekod-store-assets/`):

| Asset | File | Required |
|---|---|---|
| Store icon 128×128 | `store-icon-128.png` (96px art, 16px transparent padding) | yes |
| Screenshot 1280×800 | `screenshot-landing-1280x800.png` + **2–4 of your own** | at least 1 |
| Small promo tile 440×280 | `promo-440x280.png` | yes |
| Marquee 1400×560 | `marquee-1400x560.png` | optional |

Your own screenshots sell it: a report page with the DevTools pane open, the
on-page recording pill on a real site, the grid of rekods. Take them at
1280×800 — DevTools → device toolbar → Responsive 1280×800 → ⋮ → Capture
screenshot. Don't show real customer data.

**Homepage URL:** https://rekody.vercel.app · **Support URL:** your GitHub issues page or an email.

## 4. Privacy practices tab

**Single purpose:**
> Capture a browser tab (video or screenshot) together with that page's recent console and network activity, and upload it to the user's ReKod dashboard as a bug report.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `tabCapture` | Records the video of the tab the user chose to capture. |
| `activeTab` | Grants access to the current tab only when the user clicks the extension or presses its shortcut, to start the recording or take the screenshot. |
| `offscreen` | Holds the MediaRecorder and the per-tab log buffer in an offscreen document, since a service worker cannot record media. |
| `storage` | Remembers where the user last dragged the on-page recording control. |
| `cookies` | Reads the ReKod dashboard's own sign-in cookie (rekod.session_token) on rekody.vercel.app to authenticate uploads. No other site's cookies are read. |
| `scripting` | Re-injects the on-page recording control into an already-open tab (after install or update) so the user can stop a recording without reloading the page. |
| Host `https://rekody.vercel.app/*` | The ReKod dashboard: reads its sign-in cookie and uploads reports to its API. |
| Host `https://*.supabase.co/*` | The storage bucket recordings are uploaded to, via short-lived presigned URLs the dashboard issues. |
| Host `http://localhost/*` | For developers running the open-source ReKod dashboard on their own machine. |
| Content scripts on `<all_urls>` | The product's core feature is including the five minutes *before* the user presses record. That requires buffering each page's console and network activity from page load, in memory on the user's device. Nothing is sent anywhere until the user starts a capture. Secrets are masked before buffering. |

**Remote code:** No, I am not using remote code. (All JS ships in the package; no eval, no remote scripts.)

**Data usage — tick:**
- Personally identifiable information (Google name/email on the dashboard account; emails can appear in captured logs)
- Authentication information (the dashboard session cookie, sent only to the dashboard)
- Web history (the URL of the captured page and the URLs of its network requests)
- User activity (network monitoring of the captured page)
- Website content (video/screenshot of the tab, console messages, request/response bodies)

Leave unticked: health, financial, personal communications, location.

**Certify all three:** not sold to third parties; not used or transferred for
purposes unrelated to the single purpose; not used for creditworthiness or lending.

**Privacy policy URL:** https://rekody.vercel.app/privacy

## 5. Test instructions (Additional fields → test instructions)

> 1. Open https://rekody.vercel.app and sign in with any Google account.
> 2. Open any normal website (not chrome:// or the Web Store — the extension refuses those with a message).
> 3. Press Alt+Shift+J, or click the ReKod icon → Record tab. A small control appears on the page; click Stop after a few seconds.
> 4. Type an optional title and press Send. The report opens in a background tab on the dashboard with the video and the console/network pane.
> 5. Screenshot: click the icon → Screenshot, drag a region, Send.

## 6. Distribution

Public or Unlisted (unlisted = only people with the link can install; good for a
first release). All regions. Free.

## 7. After approval

- Point the landing page's download buttons at the store listing (Install
  section in `apps/web/src/app/page.tsx`, `components/install-steps.tsx`).
- Updates: bump `version`, `pnpm ext:store`, upload in the dashboard → Package.
  Users update automatically.
- **Adding a permission or host later disables the extension for every user
  until they accept it.** Add hosts deliberately (a future bucket, e.g. GCS,
  means one of these prompts).
- Review takes a few days; broad host access (`<all_urls>`) means an in-depth
  review, so allow up to a couple of weeks for the first one.

## What was checked for this release (0.4.0)

- Chrome packs the extension cleanly (manifest + every referenced file valid);
  every script passes `node --check`.
- A headless Chrome 155 smoke test loads the real package and passes 21 checks:
  the worker boots, capture runs on a real page, console + fetch are captured,
  the popup renders signed-out with no errors, and the Authorization header,
  `password` / `newPassword` / form-body passwords, `?token=`, `?code=`,
  `#access_token=`, response `access_token` and Google API keys never appear in
  the captured data.
- Fixed for review: refuses pages it can't run on (the Web Store itself, PDFs,
  view-source:) instead of recording with no stop control; refuses with "Sign
  in…" when signed out; WebGL probed once instead of every 2s; offscreen reason
  narrowed to USER_MEDIA; error text set with textContent; dashboard paths
  validated; unused `storage.googleapis.com` host removed; `minimum_chrome_version`
  116 (tabCapture stream ids in an offscreen document need it).
- Not tested by hand in a real browser session: a full record → upload →
  dashboard round trip with your account. Do one before submitting.
