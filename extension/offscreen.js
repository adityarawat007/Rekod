// The durable context. Owns the log buffer, the recorder, the blob and the upload.
// A hidden extension page, so unlike the service worker it is not killed on idle.
// SUPABASE_URL / SUPABASE_ANON come from auth.js. fjSession() is NOT callable
// here — it needs chrome.cookies, which only the worker and popup have.

const CAP_MS = 180_000;
const WINDOW_MS = 300_000;
const MAX = 2000;              // ponytail: entry ceiling per tab. Raise if long sessions truncate.
const MIME = ['video/webm;codecs=av01', 'video/webm;codecs=vp9', 'video/webm']
  .find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';

const buffers = new Map();     // tabId -> entries
let rec = null;                // { tabId, t0 }
let mr = null, stream = null, chunks = [], blob = null, shot = null, capTimer = null;

const trim = (a) => {
  const cut = Date.now() - WINDOW_MS;
  while (a.length && (a[0].t < cut || a.length > MAX)) a.shift();
  return a;
};
// chrome.tabs is NOT available in an offscreen document: only chrome.runtime is.
const toTab = (tabId, state) =>
  chrome.runtime.sendMessage({ to: 'bg', t: 'ui', tabId, state }).catch(() => {});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.to !== 'off') return;
  handle(msg, sender).then((r) => reply(r ?? { ok: true }));
  return true;
});

async function handle(msg, sender) {
  switch (msg.t) {
    case 'state?':
      return rec && rec.tabId === msg.tabId ? { s: 'rec', t0: rec.t0 } : { s: 'idle' };

    case 'logs': {
      const id = msg.tabId;
      if (!id) return;
      const a = buffers.get(id) || [];
      a.push(...msg.entries);
      buffers.set(id, trim(a));
      return;
    }

    case 'shot':    return takeShot(msg.dataUrl, msg.tabId);
    case 'start':   return start(msg.streamId, msg.tabId);
    case 'stop':    return stop();
    case 'discard': return discard();
    case 'send':    return upload(msg.title, msg.env);
    case 'tab-gone': {
      buffers.delete(msg.tabId);
      if (rec?.tabId === msg.tabId) await discard();
      return;
    }
  }
}

// A screenshot skips the recorder entirely: straight to compose.
async function takeShot(dataUrl, tabId) {
  shot = await (await fetch(dataUrl)).blob();
  blob = null;
  rec = { tabId, t0: Date.now() };
  const e = trim(buffers.get(tabId) || []);
  toTab(tabId, {
    t: 'state', s: 'compose', kind: 'shot', t0: rec.t0, dur: 0,
    logs: e.filter((x) => x.kind === 'console').length,
    net: e.filter((x) => x.kind === 'net').length,
  });
}

async function start(streamId, tabId) {
  stream = await navigator.mediaDevices.getUserMedia({
    video: { mandatory: {
      chromeMediaSource: 'tab', chromeMediaSourceId: streamId,
      maxWidth: 1280, maxFrameRate: 10,
    } },
  });
  stream.getVideoTracks()[0].contentHint = 'detail';
  chunks = []; blob = null; shot = null;
  mr = new MediaRecorder(stream, { mimeType: MIME, videoBitsPerSecond: 600_000 });
  mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  mr.start(1000);
  rec = { tabId, t0: Date.now() };
  capTimer = setTimeout(stop, CAP_MS);
  toTab(tabId, { t: 'state', s: 'rec', t0: rec.t0 });
}

function halt() {
  clearTimeout(capTimer);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

function finish() {
  return new Promise((res) => {
    if (!mr || mr.state === 'inactive') { halt(); return res(); }
    mr.addEventListener('stop', () => {
      blob = chunks.length ? new Blob(chunks, { type: MIME }) : null;
      halt(); res();
    }, { once: true });
    mr.stop(); mr = null;
  });
}

async function stop() {
  if (!rec) return;
  const { tabId, t0 } = rec;
  await finish();
  const e = trim(buffers.get(tabId) || []);
  toTab(tabId, {
    t: 'state', s: 'compose', kind: 'video', t0, dur: Date.now() - t0,
    logs: e.filter((x) => x.kind === 'console').length,
    net: e.filter((x) => x.kind === 'net').length,
  });
}

async function discard() {
  const tabId = rec?.tabId;
  rec = null;
  await finish();
  blob = null; shot = null; chunks = [];
  if (tabId) toTab(tabId, { t: 'state', s: 'idle' });
}

const retry = async (fn) => { try { return await fn(); } catch { return fn(); } };

async function upload(title, env) {
  if (!rec) return;
  const { tabId, t0 } = rec;
  rec = null;
  toTab(tabId, { t: 'state', s: 'uploading' });
  try {
    const entries = trim(buffers.get(tabId) || []);
    const id = crypto.randomUUID();
    const d = new Date(t0);
    const media = shot || blob;                       // png or webm, never both
    const ext = shot ? 'png' : 'webm';

    // Reports are owned rows; there is no anonymous filing any more.
    const session = await chrome.runtime.sendMessage({ to: 'bg', t: 'session' });
    if (!session) throw new Error('Session expired — log in from the FlamJam popup, then send again');
    const uid = session.user.id;

    // <uid>/<yyyy>/<mm>/ — the first segment is what the storage policy checks.
    const path = `${uid}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${id}.${ext}`;
    const auth = { apikey: SUPABASE_ANON, Authorization: `Bearer ${session.access_token}` };

    if (media) {
      await retry(async () => {
        const r = await fetch(`${SUPABASE_URL}/storage/v1/object/reports/${path}`, {
          method: 'POST', headers: { ...auth, 'Content-Type': media.type }, body: media,
        });
        if (!r.ok) throw new Error(`storage ${r.status}`);
      });
    }
    // Final guard: anything that slipped past redaction still cannot carry a NUL
    // escape into jsonb. Cheaper to scrub the serialised body than to lose a report.
    const storable = (o) => JSON.stringify(o).replace(/\\u0000/g, '');
    await retry(async () => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/reports`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: storable({
          id, owner: uid, title, t0, env: env || {},
          video_path: media ? path : null,
          page_url: env?.url ?? null,
          project: env?.host ?? null,
          status: 'new',
          logs: entries.filter((e) => e.kind === 'console' || e.kind === 'event'),
          network: entries.filter((e) => e.kind === 'net'),
        }),
      });
      if (!r.ok) throw new Error(`insert ${r.status} ${await r.text()}`);
    });
    blob = null; shot = null; chunks = [];
    buffers.delete(tabId);
    toTab(tabId, { t: 'state', s: 'sent' });
  } catch (err) {
    toTab(tabId, { t: 'state', s: 'failed', err: String(err) });
  }
}

