importScripts('auth.js');   // chrome.cookies lives here too, not in the offscreen doc

// The only context with chrome.tabs / chrome.scripting / chrome.tabCapture.
// Offscreen documents get chrome.runtime and little else, so every tab-facing call
// is routed through here. Holds no state — Chrome kills it on idle and that is fine.
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument?.()) return;
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      // AUDIO_PLAYBACK is declared for the day AUDIO goes back on in
      // offscreen.js: capturing a tab's audio takes it from the speakers, so
      // that document has to play it back out. Declaring it costs nothing while
      // recordings are silent, and keeps turning sound on a one-line change.
      reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
      justification: 'Buffer logs, record the tab, and play its audio back while recording.',
    });
  } catch (e) {
    if (!/single offscreen/i.test(String(e))) throw e;
  }
}

const ask = (msg) => chrome.runtime.sendMessage({ ...msg, to: 'off' });
// frameId 0: every frame runs widget.js now, and the UI belongs to exactly one
// of them. Without this, a page with twelve iframes wakes twelve listeners to
// ignore the same message.
const toTab = (tabId, msg) => chrome.tabs.sendMessage(tabId, msg, { frameId: 0 }).catch(() => {});
const activeTab = async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

// Reloading the extension kills content scripts in open tabs without re-injecting them,
// which leaves a dead widget behind. Put fresh ones in so no refresh is needed.
const INJECT = [
  { world: 'MAIN', files: ['redact.js', 'capture.js'] },
  { world: 'ISOLATED', files: ['widget.js'] },
];
async function reinject() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const t of tabs) {
    for (const spec of INJECT) {
      try { await chrome.scripting.executeScript({ target: { tabId: t.id }, ...spec }); } catch {}
    }
  }
}

// reinject() above only runs on onInstalled, and a manual reload of an unpacked
// extension does not reliably fire it — so a tab could be left holding a content
// script whose extension context had been invalidated. Its onMessage listener is
// dead, which is why 'rec' went nowhere and the pill appeared only after a page
// reload, when the manifest injected a fresh widget that asked 'hello' instead
// of waiting to be told. Push a live widget in before there is any state to push
// to it. widget.js retires whatever copy is already running, so this is
// idempotent and safe to call on every capture.
async function ensureWidget(tabId) {
  // capture.js is deliberately NOT re-injected: its patches cannot be applied
  // twice. Only the UI is replaceable.
  try {
    await chrome.scripting.executeScript({ target: { tabId }, world: 'ISOLATED', files: ['widget.js'] });
  } catch {}   // restricted pages reject injection; the callers already refuse those
}

// ── renewing a stale session ────────────────────────────────────────────────
// Only the dashboard may spend the refresh token, and it only spends it when a
// page of it loads. So renewing means MAKING it load — in a background tab.
//
// A tab, emphatically not a fetch. proxy.ts answers a refresh-token error by
// deleting every sb-* cookie; an extension-initiated fetch would apply that
// Set-Cookie without the user having navigated anywhere, which is why the old
// fetch-based poke was reverted (see the header of auth.js). A real navigation
// is the case that deletion exists for: if the refresh token really is spent,
// clearing the cookie and landing on /login is the correct outcome, and the
// popup then says "not signed in" because that is now true.
const REFRESH_MS = 8000;   // ponytail: a dashboard that has not painted in 8s will not

/** Resolves when the tab finishes loading, or when REFRESH_MS is up. */
function tabLoaded(tabId) {
  return new Promise((res) => {
    const done = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpd);
      res();
    };
    const onUpd = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    const timer = setTimeout(done, REFRESH_MS);
    chrome.tabs.onUpdated.addListener(onUpd);
  });
}

// One renewal at a time. The popup and an in-flight upload can both ask at
// once, and two tabs would be two refreshes of one token — the exact race the
// whole no-refresh rule exists to avoid.
let renewing = null;
function fjRenew(origin) {
  return (renewing ??= (async () => {
    let tab;
    try {
      tab = await chrome.tabs.create({ url: origin, active: false });
      await tabLoaded(tab.id);
      return await fjSession();
    } catch {
      return null;
    } finally {
      if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
      renewing = null;
    }
  })());
}

/** A live session, renewing once through the dashboard if the cookie is stale.
 *  `none` is not renewable — there is no refresh token to spend. */
async function fjLiveSession() {
  const { state, session, origin } = await fjSessionState();
  if (state === 'live') return session;
  if (state === 'none') return null;
  return fjRenew(origin);
}

chrome.runtime.onStartup.addListener(ensureOffscreen);
chrome.runtime.onInstalled.addListener(() => { ensureOffscreen(); reinject(); });

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.to !== 'bg') return;
  route(msg, sender).then(reply, (e) => reply({ err: String(e?.message || e) }));
  return true;
});

async function route(msg, sender) {
  // 'ui' and 'session' come from the offscreen document, which has neither
  // chrome.tabs nor chrome.cookies. Answered before ensureOffscreen — it is the
  // offscreen doc asking.
  if (msg.t === 'ui') { toTab(msg.tabId, msg.state); return { ok: true }; }
  if (msg.t === 'session') return fjLiveSession();
  // The dashboard, in a BACKGROUND tab: the report is there when it is wanted,
  // and whatever was being done on the page carries on.
  if (msg.t === 'open') {
    // Only a dashboard this extension already trusts: the origin must be one of
    // DASH_ORIGINS (auth.js), else it falls back to DASH. So a message can pick
    // prod or the dev server — where the upload landed — and nothing else.
    const origin = DASH_ORIGINS.includes(msg.origin) ? msg.origin : DASH;
    chrome.tabs.create({ url: origin + (msg.path || '/'), active: false });
    return { ok: true };
  }

  await ensureOffscreen();
  const tabId = sender.tab?.id;

  switch (msg.t) {
    case 'hello':  return (await ask({ t: 'state?', tabId })) || { s: 'idle' };
    case 'record': return startVideo(await activeTab());
    case 'shot':   return startShot(await activeTab());

    // from the content script — stamp the tab id here, where it is trustworthy
    case 'logs':
    case 'stop':
    case 'crop':
    case 'discard':
    case 'send':   return ask({ ...msg, tabId });

    default:       return { ok: true };
  }
}

const RESTRICTED = /^(chrome|edge|about|devtools):/;
const refuse = (tab) => {
  if (!tab?.id) throw new Error('No active tab');
  if (RESTRICTED.test(tab.url || '')) throw new Error("Chrome's own pages can't be captured");
};

async function startVideo(tab) {
  refuse(tab);
  // The mic setting lives in storage, not in the message, because the hotkey
  // path never opens the popup — one switch for both ways in. Nothing writes it
  // while AUDIO is off in offscreen.js, which ignores the flag anyway; the read
  // stays so the switch is the only thing that has to come back.
  const { fjMic } = await chrome.storage.local.get('fjMic');
  // tabCapture needs activeTab, which the popup click or the command gesture grants.
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  await ensureWidget(tab.id);
  const r = await ask({ t: 'start', streamId, tabId: tab.id, mic: !!fjMic });
  if (r?.err) throw new Error(r.err);
  return { ok: true };
}

async function startShot(tab) {
  refuse(tab);
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  await ensureWidget(tab.id);
  const r = await ask({ t: 'shot', dataUrl, tabId: tab.id });
  if (r?.err) throw new Error(r.err);
  return { ok: true };
}

chrome.commands.onCommand.addListener(async (cmd, tab) => {
  if (cmd !== 'capture') return;
  const t = tab?.id ? tab : await activeTab();
  try {
    await ensureOffscreen();
    const state = await ask({ t: 'state?', tabId: t?.id });
    if (state?.s === 'rec') return void ask({ t: 'stop', tabId: t.id });
    await startVideo(t);
  } catch (e) {
    if (t?.id) toTab(t.id, { t: 'state', s: 'failed', err: String(e?.message || e) });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  ensureOffscreen().then(() => ask({ t: 'tab-gone', tabId })).catch(() => {});
});
