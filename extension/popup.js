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

function render(session) {
  $('err').hidden = true;
  const on = !!session;
  show($('gate'), !on);
  show($('capture'), on);
  show($('hotkey'), on);
  show($('who'), on);
  if (on) $('me').textContent = session.user?.email ?? 'signed in';
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

$('login').onclick = () => openDash('/login');
$('dash').onclick = () => openDash('/');   // the grid IS the list; /reports is gone

fjSession().then(async (session) => {
  render(session);
  if (session) return;
  // Right-click the popup > Inspect to read it there too; the worker logs its
  // own copy to the service worker console.
  const why = await fjWhy();
  console.log('[FlamJam] no session\n' + why);
  fail(why);
});
