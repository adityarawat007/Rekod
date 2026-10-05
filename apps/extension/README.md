# rekod for Chrome

rekod keeps the last five minutes of a tab's console and network traffic in
memory, all the time. When something breaks, you press record (or take a
screenshot) and the bug's history is already attached: the requests that
failed, the error that followed, and the page it happened on. The capture goes
to your rekod dashboard, where the video and the log play back on one timeline
and you can share it with a link.

Nothing is uploaded until you press Send.

## Install from the zip

1. Download `rekod-extension.zip` from the rekod landing page.
2. Unzip it. You get one folder, `rekod-extension`. Put it somewhere it can
   stay: Chrome loads the extension from that folder every time it starts, so
   deleting or moving it removes the extension.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode** (top right).
5. Click **Load unpacked** and pick the `rekod-extension` folder (the one that
   has `manifest.json` directly inside it).
6. Click the puzzle-piece icon in the toolbar and pin rekod, so its button is
   always one click away.

This works in Chrome and other Chromium browsers that allow unpacked
extensions (Edge, Brave, Arc).

## Install from source

If you have the repository, load `apps/extension/` directly. There is no build
step: the source is what ships.

Point **Load unpacked** at `apps/extension/`, never at the repository root.
Chrome reads and packages everything inside the folder you give it, and the
root holds `node_modules` (over a gigabyte) and `.env` files with secrets in
them.

To rebuild the downloadable zip after changing the extension, run this from
the repository root:

```
pnpm ext:zip
```

It writes `apps/web/public/rekod-extension.zip` (the file the landing page
serves) and `apps/web/src/lib/extension-release.json` (the version and size
the landing page shows). Bump `version` in `manifest.json` first if the change
is going out to people.

## Signing in

The extension has no sign-in of its own. It uses your dashboard session:

1. Open the dashboard and sign in with Google.
2. Click the rekod button in the toolbar. It shows your email when it can see
   the session.

It looks for a session on these dashboards, in this order, and uploads to
whichever one it finds first:

- `https://rekody.vercel.app`
- `http://localhost:3100` (the dev server)

Signing out of the dashboard signs the extension out too.

## Using it

**Record a video.** Press `Alt+Shift+J` (`⌥⇧J` on a Mac), or click the rekod
button and choose **Record this tab**. A small pill appears on the page while
it records. Recordings stop at 3 minutes. Press the shortcut again, or stop
from the pill, to finish. You can change the shortcut at
`chrome://extensions/shortcuts`.

**Take a screenshot.** Click the rekod button and choose **Screenshot this
tab**, then drag over the part of the page you want. A click without a drag
takes the whole visible tab. `Esc` cancels.

**Send it.** A card on the page asks for a title and a description, both
optional. **Send** uploads it and opens the new rekod on the dashboard in a
background tab. **Discard** throws it away.

What a rekod contains:

- The video or the screenshot of the tab.
- Console output: `log`, `info`, `warn`, `error`, `debug`, uncaught errors and
  unhandled promise rejections.
- Network: `fetch` and `XMLHttpRequest` with headers and bodies, WebSocket
  connections and frames, WebRTC data channels, and resource timings for
  scripts, styles, images and fonts.
- Page events: loads, in-app route changes, back and forward, the tab being
  hidden or shown.
- The environment: URL, browser and OS, window size and pixel ratio, GPU, and
  a build id if the page has a `<meta name="build">` tag.

The log covers the five minutes before you pressed record as well as the
recording itself. Times before the start are shown with a minus sign, like
`−0:12`.

### Redaction

Before anything is stored, `redact.js` scrubs the log in the page itself:

- Header values for `Authorization`, `Cookie`, `Set-Cookie`, `X-API-Key`,
  `X-Auth-Token`, `Proxy-Authorization`, `X-CSRF-Token` become `[redacted]`.
- Object keys and URL query parameters named like `password`, `token`,
  `access_token`, `secret`, `api_key`, `session`, `jwt`, `otp`, `cvv`,
  `card_number`, `ssn` and similar have their values replaced.
- JWTs, `Bearer` tokens, and Stripe, OpenAI-style, GitHub and AWS keys are
  replaced wherever they appear in text.
- Email addresses are masked to `[email]@domain`.

Redaction covers the console and network log only. The video and the
screenshot are pixels: whatever is on screen is in them. Close what you do not
want to share before you record.

## Updating

1. Download the new `rekod-extension.zip`.
2. Unzip it and replace the old `rekod-extension` folder with the new one
   (same place, same name).
3. Open `chrome://extensions` and click the reload arrow on the rekod card.

The version is on that card. Reload any tab you want to capture from, so it
runs the new version from its first request.

## Troubleshooting

**"You are not signed in" in the popup.** The extension cannot see a
dashboard session. Sign in on the dashboard, then open the popup again. If you
run your own dashboard, its origin has to be in the extension (see below).

**"This version of Rekod is out of date."** The dashboard you upload to
refuses versions older than its `MIN_EXTENSION_VERSION`. Download the current
zip and follow the update steps above.

**"Chrome's own pages can't be captured."** Chrome does not let extensions
record `chrome://` pages, the Web Store, or other extensions' pages. Use a
normal web page.

**The log is empty or starts late.** Capture begins when the page loads with
the extension running. A tab that was open before you installed or reloaded
the extension has history only from that moment; reload the tab to start
clean.

**A limit message, like "You have used all N Rekods on your plan."** These
come from the dashboard and are shown word for word. Do what it says (delete
one, wait, or record something shorter).

**Upload fails right after Send.** Check the extension's errors on
`chrome://extensions` (the **Errors** button on the card). A CORS or
"Failed to fetch" error on the upload means the storage bucket's origin is
missing from `host_permissions` (next section).

## Running your own dashboard

The extension is set up for `https://rekody.vercel.app`. To point it at your
own deployment, change two files and reload it:

1. **`auth.js`**: put your dashboard's origin first in `DASH_ORIGINS`. The
   first entry is also where the popup's Log in button goes.

   ```js
   const DASH_ORIGINS = ['https://rekod.example.com', 'http://localhost:3100'];
   ```

2. **`manifest.json`**: add `host_permissions` for
   - every origin in `DASH_ORIGINS` (without it, `chrome.cookies` returns
     nothing for that origin and you look signed out), and
   - your bucket's origin, because the files are uploaded straight to it with
     presigned URLs (for example `https://<account>.r2.cloudflarestorage.com/*`
     or `https://s3.<region>.amazonaws.com/*`). `https://*.supabase.co/*` and
     `http://localhost/*` (any port, so a local MinIO too) are already there.

The session cookie name is fixed (`rekod.session_token`, with the `__Secure-`
prefix over https), so the server needs no change for the extension to find
it. Run `pnpm ext:zip` afterwards if you hand the zip to other people.
