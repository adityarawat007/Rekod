# rekod for Chrome

rekod keeps the last five minutes of a tab's console and network traffic in
memory, all the time. When something breaks, you press record (or take a
screenshot) and the bug's history is already attached: the requests that
failed, the error that followed, and the page it happened on. The capture goes
to your rekod dashboard, where the video and the log play back on one timeline
and you can share it with a link.

Nothing is uploaded until you press Send.

## Install

Add it from the [Chrome Web Store](https://chromewebstore.google.com/detail/mldnjcigeamapdffjohhgiajjbikjcjc), then click the
puzzle-piece icon in the toolbar and pin rekod, so its button is always one
click away. Chrome keeps it up to date.

## Install from source

If you have the repository, load `apps/extension/` directly. There is no build
step: the source is what ships.

Point **Load unpacked** at `apps/extension/`, never at the repository root.
Chrome reads and packages everything inside the folder you give it, and the
root holds `node_modules` (over a gigabyte) and `.env` files with secrets in
them.

To package a release for the Chrome Web Store, bump `version` in
`manifest.json`, then run this from the repository root:

```
pnpm ext:store
```

It writes `rekod-<version>-chrome-web-store.zip` to the Desktop.

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

Chrome updates Web Store extensions on its own. To get a new version now, open
`chrome://extensions`, turn on Developer mode and click **Update**. Reload any
tab you want to capture from, so it runs the new version from its first
request.

## Troubleshooting

**"You are not signed in" in the popup.** The extension cannot see a
dashboard session. Sign in on the dashboard, then open the popup again. If you
run your own dashboard, its origin has to be in the extension (see below).

**"This version of Rekod is out of date."** The dashboard you upload to
refuses versions older than its `MIN_EXTENSION_VERSION`. Follow the update
steps above.

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

See "Point the extension at your server" in the repo's main README: two edits
(`auth.js` DASH_ORIGINS, `manifest.json` host_permissions), then load
`apps/extension/` unpacked.
