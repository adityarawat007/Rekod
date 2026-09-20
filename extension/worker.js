importScripts('auth.js');   // chrome.cookies lives here too, not in the offscreen doc

// The only context with chrome.tabs / chrome.scripting / chrome.tabCapture.
// Offscreen documents get chrome.runtime and little else, so every tab-facing call
// is routed through here. Holds no state — Chrome kills it on idle and that is fine.
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument?.()) return;
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Buffer logs and record the tab across page navigations.',
    });
  } catch (e) {
    if (!/single offscreen/i.test(String(e))) throw e;
  }
}

const ask = (msg) => chrome.runtime.sendMessage({ ...msg, to: 'off' });
const toTab = (tabId, msg) => chrome.tabs.sendMessage(tabId, msg).catch(() => {});
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
  if (msg.t === 'session') return fjSession();

  await ensureOffscreen();
  const tabId = sender.tab?.id;

  switch (msg.t) {
    case 'hello':  return (await ask({ t: 'state?', tabId })) || { s: 'idle' };
    case 'record': return startVideo(await activeTab());
    case 'shot':   return startShot(await activeTab());

    // from the content script — stamp the tab id here, where it is trustworthy
    case 'logs':
    case 'stop':
    case 'discard':
    case 'send':   return ask({ ...msg, tabId });

    default:       return { ok: true };
  }
}

async function startVideo(tab) {
  if (!tab?.id) throw new Error('No active tab');
  if (/^(chrome|edge|about|devtools):/.test(tab.url || '')) throw new Error("Chrome's own pages can't be captured");
  // tabCapture needs activeTab, which the popup click or the command gesture grants.
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  await ensureWidget(tab.id);
  await ask({ t: 'start', streamId, tabId: tab.id });
  return { ok: true };
}

async function startShot(tab) {
  if (!tab?.id) throw new Error('No active tab');
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  await ensureWidget(tab.id);
  await ask({ t: 'shot', dataUrl, tabId: tab.id });
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
