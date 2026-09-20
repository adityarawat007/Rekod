// Two views in one popup: the expired card, or capture. Recording only —
// the screenshot button is parked, not deleted: worker.js still routes 'shot'
// and the viewer still renders existing screenshot reports. Which one shows is just
// whether the dashboard has a live session — the uploader needs a real token
// now that reports are owned rows. Signing in happens on the dashboard.
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
    path: '/',
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

const openDash = (path) => {
  chrome.tabs.create({ url: DASH + path });
  window.close();
};

$('login').onclick = () => openDash(gatePath);
$('dash').onclick = () => openDash('/');   // the grid IS the list; /reports is gone

// Ask the worker, not the cookie: it is the one with chrome.tabs, so it can
// renew a stale session by loading the dashboard in a background tab. Only if
// that comes back empty do we read the cookie ourselves, to find out which of
// the two gate cards to show.
(async () => {
  const session = await chrome.runtime.sendMessage({ to: 'bg', t: 'session' }).catch(() => null);
  render(session ? { state: 'live', session } : await fjSessionState());
})();
