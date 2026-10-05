// Two views in one popup: the expired card, or capture. Two ways to capture —
// record the tab, or take a screenshot of it (un-parked 23 Sep 2026; the routing
// and the viewer had never gone away). Which view shows is just whether the
// dashboard has a live session — the uploader needs a real token now that
// reports are owned rows. Signing in happens on the dashboard. Sound is built
// and switched off: see AUDIO in offscreen.js and the commented block below.
const $ = (id) => document.getElementById(id);
const show = (el, on) => { el.hidden = !on; };

const fail = (msg) => {
  $('err').hidden = false;
  $('err').textContent = msg;
};

// Two ways to have no live token, and they need different words and different
// destinations. `stale` is the common one by a mile: Supabase access tokens
// last an hour, only the dashboard may refresh one, and this extension makes no
// network request of its own — so an hour after the last dashboard visit a
// signed-in user got an "expired, log in again" card. /login then bounced them
// straight back to /, which refreshed the cookie, which made the card look like
// a lie. It was: nothing had expired that a page load did not fix.
const GATE = {
  stale: {
    title: 'Your session needs a refresh',
    note: 'You are still signed in. Only the dashboard can renew the token — open it once and come back.',
    cta: 'Open dashboard',
    path: '/rekod',
  },
  none: {
    title: 'You are not signed in',
    note: 'Sign in on the dashboard to start recording.',
    cta: 'Log in',
    path: '/login',
  },
};
let gatePath = '/login';

function render({ state, session }) {
  $('err').hidden = true;
  $('busy').hidden = true;
  const on = state === 'live';
  show($('gate'), !on);
  show($('capture'), on);
  show($('hotkey'), on);
  show($('who'), on);
  if (on) {
    $('me').textContent = session.user?.email ?? 'signed in';
    return;
  }
  const g = GATE[state];
  $('gate-title').textContent = g.title;
  $('gate-note').textContent = g.note;
  $('gate-cta').textContent = g.cta;
  gatePath = g.path;
}

const go = async (t, btn) => {
  btn.disabled = true;
  const r = await chrome.runtime.sendMessage({ to: 'bg', t });
  if (r?.err) {
    fail(r.err);
    btn.disabled = false;
    return;
  }
  window.close();          // the widget on the page takes over from here
};

$('rec').onclick = (e) => go('record', e.currentTarget);
$('shot').onclick = (e) => go('shot', e.currentTarget);

/* ── the microphone switch — off with the rest of the sound ─────────────────
   Uncomment with the <label class="toggle"> block in popup.html and AUDIO in
   offscreen.js. Tab audio needs no permission and rides along with the video;
   the mic is a choice and a prompt. The setting lives in chrome.storage
   because the hotkey path never opens this popup — worker.js reads it there.

const mic = $('mic');
const micNote = $('mic-note');
const micState = async () => {
  try { return (await navigator.permissions.query({ name: 'microphone' })).state; }
  catch { return 'prompt'; }          // Chrome without the descriptor: assume unknown
};

const paintMic = async (on) => {
  micNote.textContent = !on ? 'Off — tab audio only'
    : (await micState()) === 'denied' ? 'Blocked — allow it in site settings'
    : 'On — mixed with the tab audio';
};

mic.onchange = async () => {
  const on = mic.checked;
  chrome.storage.local.set({ fjMic: on });
  // Asking for the mic is the caller's job and it can only be done from a
  // window: the offscreen document that records has none, and this popup is
  // closed by the prompt taking focus. Same page in a tab can prompt, so that
  // is where a first grant happens — one file, not a second permission page.
  if (on && (await micState()) === 'prompt') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?mic=1') });
    window.close();
    return;
  }
  paintMic(on);
};

// This same page opened in a TAB with ?mic=1 is the permission prompt, and
// nothing else: no session check, no capture buttons. Chrome remembers the
// grant for the extension origin, which is what the offscreen recorder uses.
async function askMic() {
  $('busy').textContent = 'Asking for the microphone…';
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());     // the grant is the point, not the stream
    $('busy').textContent = 'Microphone enabled. Close this tab and record.';
  } catch {
    chrome.storage.local.set({ fjMic: false });
    $('busy').textContent = '';
    fail('Microphone blocked. Allow it for this extension, or record with tab audio only.');
  }
}
─────────────────────────────────────────────────────────────────────────── */

const openDash = (path) => {
  chrome.tabs.create({ url: DASH + path });
  window.close();
};

$('login').onclick = () => openDash(gatePath);
$('dash').onclick = () => openDash('/rekod');   // the grid; / is the public landing page

// Ask the worker, not the cookie: it is the one with chrome.tabs, so it can
// renew a stale session by loading the dashboard in a background tab. Only if
// that comes back empty do we read the cookie ourselves, to find out which of
// the two gate cards to show.
async function boot() {
  const session = await chrome.runtime.sendMessage({ to: 'bg', t: 'session' }).catch(() => null);
  render(session ? { state: 'live', session } : await fjSessionState());
}

boot();
