// The durable context. Owns the log buffer, the recorder, the blob and the upload.
// A hidden extension page, so unlike the service worker it is not killed on idle.
// fjSession() is NOT callable here — it needs chrome.cookies, which only the
// worker and popup have — so upload() asks the worker for the session.

const CAP_MS = 180_000;
const WINDOW_MS = 300_000;
const MAX = 2000;              // ponytail: entry ceiling per tab. Raise if long sessions truncate.
// Sound is built and switched off. Recordings are silent again: no tab audio,
// no mic, no permission page, no audio graph — this one flag gates all of it,
// and with it false every line below behaves exactly as it did before audio
// existed. Flip it to true to bring the feature back whole, then check the audio
// by hand — nothing tests the dormant path.
const AUDIO = false;
// Picked per recording, not once: the audio codec belongs in the string only
// when the stream actually carries an audio track.
const mimeFor = (audio) =>
  ['video/webm;codecs=av01', 'video/webm;codecs=vp9', 'video/webm']
    .map((m) => (audio && m.includes('codecs=') ? `${m},opus` : m))
    .find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';

const buffers = new Map();     // tabId -> entries
let rec = null;                // { tabId, t0 }
let mr = null, stream = null, chunks = [], blob = null, shot = null, capTimer = null;
let shotFull = null;           // the whole visible tab, waiting for a selection
let mime = 'video/webm';
let ctx = null, micStream = null;   // the audio graph, torn down in halt()
// Read by the composer, so they outlive halt() — which nulls micStream before
// stop() gets to describe the recording.
let micWanted = false, micOn = false;

const trim = (a) => {
  const cut = Date.now() - WINDOW_MS;
  while (a.length && (a[0].t < cut || a.length > MAX)) a.shift();
  return a;
};
// chrome.tabs is NOT available in an offscreen document: only chrome.runtime is.
// The last state sent is kept so `state?` can hand it back whole: a widget is
// re-injected on every navigation and asks what is in flight, and answering
// "recording" for a capture that is actually waiting to be written up put a
// stop button over a composer.
let last = null;
const toTab = (tabId, state) => {
  last = state;
  return chrome.runtime.sendMessage({ to: 'bg', t: 'ui', tabId, state }).catch(() => {});
};

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.to !== 'off') return;
  // The rejection arm matters: without it a getUserMedia that throws leaves the
  // channel open and the caller sees "message port closed", not the reason.
  handle(msg, sender).then((r) => reply(r ?? { ok: true }), (e) => reply({ err: String(e?.message || e) }));
  return true;
});

async function handle(msg, sender) {
  switch (msg.t) {
    case 'state?':
      // Only while something is in flight: once `rec` is cleared the last state
      // was 'sent' or 'failed', which a fresh page has no business showing.
      return rec && rec.tabId === msg.tabId ? (last ?? { s: 'rec', t0: rec.t0 }) : { s: 'idle' };

    case 'logs': {
      const id = msg.tabId;
      if (!id) return;
      const a = buffers.get(id) || [];
      a.push(...msg.entries);
      buffers.set(id, trim(a));
      return;
    }

    case 'shot':    return takeShot(msg.dataUrl, msg.tabId);
    case 'crop':    return cropShot(msg.rect, msg.vw);
    case 'start':   return start(msg.streamId, msg.tabId, msg.mic);
    case 'stop':    return stop();
    case 'discard': return discard();
    case 'send':    return upload(msg.title, msg.desc, msg.env);
    case 'tab-gone': {
      buffers.delete(msg.tabId);
      if (rec?.tabId === msg.tabId) await discard();
      return;
    }
  }
}

// A screenshot skips the recorder entirely: capture, select, compose.
//
// The whole visible tab is captured FIRST and the selection is made afterwards,
// on the live page — the other order puts our own dimmed overlay in the
// picture. So this step only parks the image and asks the widget for a
// rectangle; `cropShot` finishes the job.
//
// There is one `rec`, so a shot taken while anything else is in flight would
// overwrite that capture's compose state and lose it — including a recording
// running in another tab, which `state?` reports as idle. Refuse here, where
// the one piece of state lives, rather than in each caller.
async function takeShot(dataUrl, tabId) {
  if (rec) return { err: 'Finish the capture in progress first' };
  shotFull = await (await fetch(dataUrl)).blob();
  shot = null; blob = null;
  rec = { tabId, t0: Date.now() };
  toTab(tabId, { t: 'state', s: 'crop' });
}

/** The selection, in CSS pixels, or null for "the whole visible tab".
 *
 *  The scale comes from the image itself (`bmp.width / vw`) rather than from
 *  devicePixelRatio: captureVisibleTab renders at the device scale, and under
 *  page zoom the two disagree — by enough to crop the wrong thing. */
async function cropShot(rect, vw) {
  if (!rec || !shotFull) return { err: 'Nothing to crop' };
  const { tabId, t0 } = rec;
  const bmp = await createImageBitmap(shotFull);
  let x = 0, y = 0, w = bmp.width, h = bmp.height;
  if (rect) {
    const s = vw > 0 ? bmp.width / vw : 1;
    x = Math.max(0, Math.min(bmp.width - 1, Math.round(rect.x * s)));
    y = Math.max(0, Math.min(bmp.height - 1, Math.round(rect.y * s)));
    w = Math.min(bmp.width - x, Math.round(rect.w * s));
    h = Math.min(bmp.height - y, Math.round(rect.h * s));
  }
  // A selection that clamped away to nothing is a mis-drag, not a request for
  // an empty PNG: fall back to everything.
  if (w < 1 || h < 1) { x = 0; y = 0; w = bmp.width; h = bmp.height; }
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d').drawImage(bmp, x, y, w, h, 0, 0, w, h);
  shot = await canvas.convertToBlob({ type: 'image/png' });
  bmp.close?.();
  shotFull = null;

  const e = trim(buffers.get(tabId) || []);
  pre = preupload(tabId, t0);
  toTab(tabId, {
    t: 'state', s: 'compose', kind: 'shot', t0, dur: 0, dims: `${w}×${h}`,
    logs: e.filter((x) => x.kind === 'console').length,
    net: e.filter((x) => x.kind === 'net').length,
  });
}

/** The tab's own picture and sound. One stream id serves both constraints.
 *  ponytail: one retry without audio — a tab that cannot hand over its audio
 *  (rare, but a capture already held elsewhere does it) is still worth
 *  recording silently. The retry may fail too: a stream id is short-lived. */
async function grab(streamId) {
  const tab = (extra) => ({ mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId, ...extra } });
  const video = tab({ maxWidth: 1280, maxFrameRate: 10 });
  if (!AUDIO) return navigator.mediaDevices.getUserMedia({ video });
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: tab({}), video });
  } catch {
    return navigator.mediaDevices.getUserMedia({ video });
  }
}

async function start(streamId, tabId, mic) {
  if (rec) return { err: 'A capture is already in progress' };
  stream = await grab(streamId);
  stream.getVideoTracks()[0].contentHint = 'detail';

  // The mic is optional and its permission is granted on an extension PAGE —
  // an offscreen document has no window to prompt from. Denied means record
  // without it, never fail the recording. See popup.js.
  micStream = AUDIO && mic
    ? await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null)
    : null;
  // Remembered so the composer can say so. A mic that was asked for and did not
  // arrive is the one failure worth a word: everything else about the recording
  // is visible, and silence is not.
  micWanted = AUDIO && !!mic;
  micOn = !!micStream;

  // Capturing a tab's audio takes it away from the speakers, so it is piped
  // back to the output as well as into the recording — otherwise the person
  // recording hears nothing and reports that as the bug.
  const tabAudio = stream.getAudioTracks();
  let recorded = stream;
  if (tabAudio.length || micStream) {
    ctx = new AudioContext();
    ctx.resume?.().catch(() => {});   // no user gesture reaches this document
    const mix = ctx.createMediaStreamDestination();
    if (tabAudio.length) {
      const src = ctx.createMediaStreamSource(new MediaStream(tabAudio));
      src.connect(ctx.destination);
      src.connect(mix);
    }
    if (micStream) ctx.createMediaStreamSource(micStream).connect(mix);
    recorded = new MediaStream([...stream.getVideoTracks(), ...mix.stream.getAudioTracks()]);
  }

  chunks = []; blob = null; shot = null;
  mime = mimeFor(recorded.getAudioTracks().length > 0);
  mr = new MediaRecorder(recorded, { mimeType: mime, videoBitsPerSecond: 600_000 });
  mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  mr.start(1000);
  rec = { tabId, t0: Date.now() };
  capTimer = setTimeout(stop, CAP_MS);
  toTab(tabId, { t: 'state', s: 'rec', t0: rec.t0 });
}

function halt() {
  clearTimeout(capTimer);
  stream?.getTracks().forEach((t) => t.stop());
  // The mic track is not in `stream` — it never was captured from the tab.
  // Left running, Chrome keeps the recording indicator lit after the recording.
  micStream?.getTracks().forEach((t) => t.stop());
  ctx?.close().catch(() => {});
  stream = null; micStream = null; ctx = null;
}

function finish() {
  return new Promise((res) => {
    if (!mr || mr.state === 'inactive') { halt(); return res(); }
    mr.addEventListener('stop', () => {
      blob = chunks.length ? new Blob(chunks, { type: mime }) : null;
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
  pre = preupload(tabId, t0);
  toTab(tabId, {
    t: 'state', s: 'compose', kind: 'video', t0, dur: Date.now() - t0,
    mic: micWanted ? (micOn ? 'on' : 'denied') : null,
    logs: e.filter((x) => x.kind === 'console').length,
    net: e.filter((x) => x.kind === 'net').length,
  });
}

async function discard() {
  const tabId = rec?.tabId;
  rec = null;
  // The composer was uploading this capture in the background. Thrown away
  // means thrown away: its files and its unlisted `processing` row go too.
  // Best-effort — a leftover is unlisted, and the retention job sweeps it.
  pre?.then(({ id, session }) => api(session, `/api/v1/reports/${id}`, undefined, 'DELETE')).catch(() => {});
  pre = null;
  await finish();
  blob = null; shot = null; shotFull = null; chunks = [];
  if (tabId) toTab(tabId, { t: 'state', s: 'idle' });
}

const retry = async (fn) => { try { return await fn(); } catch { return fn(); } };

/** A call to the dashboard that issued the session, as that session. */
async function api(session, path, body, method = 'POST') {
  const r = await fetch(`${session.origin}${path}`, {
    method,
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    // Anything that slipped past redaction still cannot carry a NUL escape
    // into jsonb (env is stored as one). Cheaper to scrub than lose a report.
    body: body === undefined ? undefined : JSON.stringify(body).replace(/\\u0000/g, ''),
  });
  if (!r.ok) throw new Error(`${path} ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

// The upload starts the moment there is something to upload — when the
// recording stops, or once a screenshot is cropped — and runs while the
// composer is open. Send then only has to name it: one small call instead of
// the whole upload, so "Sending" is gone in well under a second.
let pre = null;   // Promise<{ id, session }> for the capture waiting in the composer

/** Create → PUT everything straight to the bucket. Resolves once every byte
 *  has landed; the report stays `processing` (unlisted) until Send. The logs
 *  are taken NOW, at the end of the capture, not whenever Send is pressed. */
function preupload(tabId, t0) {
  const media = shot || blob;                       // png or webm, never both
  const entries = trim(buffers.get(tabId) || []);
  const p = (async () => {
    // Reports belong to a signed-in workspace; there is no anonymous filing.
    const session = await chrome.runtime.sendMessage({ to: 'bg', t: 'session' });
    if (!session?.access_token) throw new Error('Not signed in — open the dashboard, sign in, then send again');

    // The row, in `processing`, and one presigned PUT per file. The server
    // picks the id, the storage keys and the workspace. The title and the page
    // are not known yet — they come with /complete.
    const { id, uploads } = await retry(() => api(session, '/api/v1/reports', {
      t0, durationMs: shot ? null : Date.now() - t0, media: media ? media.type : null,
    }));

    // The bytes, straight to the bucket. Logs and network are files, not
    // columns — five minutes of them would not fit a request body.
    const put = (url, body, type) => retry(async () => {
      const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': type }, body });
      if (!r.ok) throw new Error(`upload ${r.status}`);
    });
    const json = (o) => new Blob([JSON.stringify(o)], { type: 'application/json' });
    await Promise.all([
      media && put(uploads.media, media, media.type),
      put(uploads.logs, json(entries.filter((e) => e.kind === 'console' || e.kind === 'event')), 'application/json'),
      put(uploads.network, json(entries.filter((e) => e.kind === 'net')), 'application/json'),
    ]);
    return { id, session };
  })();
  p.catch(() => {});   // reported at Send, which retries; never an unhandled rejection
  return p;
}

async function upload(title, desc, env) {
  if (!rec) return;
  const { tabId, t0 } = rec;
  rec = null;
  toTab(tabId, { t: 'state', s: 'uploading' });
  try {
    // Usually already done while the composer was open. If it failed — signed
    // out at the time, a dropped connection — try the whole thing once more
    // now, with a fresh session.
    let up = await pre?.catch(() => null);
    pre = null;
    up ??= await preupload(tabId, t0);

    // Name it and make it `ready` — until this returns the report is unlisted,
    // so a half-finished upload never shows up as a card you cannot play.
    await retry(() => api(up.session, `/api/v1/reports/${up.id}/complete`, {
      title: title || '', description: desc || null, env: env || {},
      pageUrl: env?.url ?? null, project: env?.host ?? null,
    }));
    const { id, session } = up;

    blob = null; shot = null; shotFull = null; chunks = [];
    buffers.delete(tabId);
    toTab(tabId, { t: 'state', s: 'sent' });
    // Land on the thing that was just filed. An offscreen document has no
    // chrome.tabs, so the worker opens it — and it is opened only after the
    // insert succeeded, because a tab pointing at a report that does not exist
    // is a 404 that reads as data loss.
    // The dashboard it was filed to, not always prod: a dev-server session
    // uploads to the dev server, and the report only exists there.
    chrome.runtime.sendMessage({ to: 'bg', t: 'open', origin: session.origin, path: `/reports/${id}` }).catch(() => {});
  } catch (err) {
    toTab(tabId, { t: 'state', s: 'failed', err: String(err) });
  }
}

