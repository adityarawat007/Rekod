// node test-capture.js — the capture gate: audio wiring and the screenshot path.
//
// extension/offscreen.js is a classic script (it shares globals with auth.js),
// so it is evaluated here with `chrome`, `navigator`, `MediaRecorder`,
// `AudioContext` and `MediaStream` shadowed by stubs — same trick as
// test-auth.js. What is worth guarding is the wiring, not the codecs:
//
//   - what ships: AUDIO is off, so nothing asks for audio and nothing mixes it
//   - the tab's audio is piped BACK to the speakers, or recording a tab mutes it
//   - the mic is mixed in, and a denied mic never fails the recording
//   - the mic track is stopped afterwards, or the recording indicator stays lit
//   - one capture at a time: a screenshot cannot overwrite a running recording
//
// The audio blocks run against a copy of offscreen.js with AUDIO flipped to
// true, because the feature is switched off rather than removed — dormant code
// that nothing checks is code that does not work when it is woken up.
const assert = require('node:assert');
const { readFileSync } = require('node:fs');

const src = readFileSync(`${__dirname}/extension/offscreen.js`, 'utf8');

const track = (kind, label) => ({ kind, label, stopped: false, stop() { this.stopped = true; } });

class FakeStream {
  constructor(tracks = []) { this.tracks = [...tracks]; }
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter((t) => t.kind === 'audio'); }
  getVideoTracks() { return this.tracks.filter((t) => t.kind === 'video'); }
}

class FakeNode {
  constructor(label) { this.label = label; this.out = []; }
  connect(n) { this.out.push(n); return n; }
}

class FakeCtx {
  constructor() {
    this.destination = new FakeNode('speakers');
    this.sources = [];
    this.closed = false;
    this.resumed = false;
    FakeCtx.last = this;
  }
  createMediaStreamSource(s) {
    const n = new FakeNode(s.getAudioTracks()[0]?.label ?? 'silent');
    this.sources.push(n);
    return n;
  }
  createMediaStreamDestination() {
    this.mix = new FakeNode('mix');
    this.mix.stream = new FakeStream([track('audio', 'mixed')]);
    return this.mix;
  }
  resume() { this.resumed = true; return Promise.resolve(); }
  close() { this.closed = true; return Promise.resolve(); }
}

/** A 2560x1440 capture of a 1280x720 viewport: a retina tab, so scale 2. */
class FakeBitmap {
  constructor(w, h) { this.width = w; this.height = h; this.closed = false; }
  close() { this.closed = true; }
}

class FakeCanvas {
  constructor(w, h) { this.width = w; this.height = h; FakeCanvas.last = this; }
  getContext() { return { drawImage: (...a) => { this.drew = a.slice(1); } }; }
  convertToBlob() { return Promise.resolve(new Blob(['png'])); }
}

class FakeRec {
  constructor(stream, opts) {
    this.stream = stream; this.opts = opts; this.state = 'recording'; this.on = {};
    FakeRec.last = this;
  }
  start() {}
  addEventListener(ev, cb) { this.on[ev] = cb; }
  stop() { this.state = 'inactive'; this.on.stop?.(); }
}

const FLAG = 'const AUDIO = false';
assert.ok(src.includes(FLAG), 'offscreen.js must keep the AUDIO flag this file flips');

/** One loaded copy of offscreen.js plus the stubs it was given.
 *  `sound` flips the AUDIO flag in the copy: recordings ship silent, and the
 *  audio wiring is dormant rather than gone, so it is checked in the state it
 *  would come back in. Every assertion below without `sound` is the shipped one. */
function boot({ audio = true, mic = 'ok', supports = () => true, chrome: chromeStub, sound = false } = {}) {
  const source = sound ? src.replace(FLAG, 'const AUDIO = true') : src;
  const calls = [];             // every getUserMedia constraint, in order
  const sent = [];              // every message to the worker (UI states)
  FakeCtx.last = null;
  FakeRec.last = null;

  const getUserMedia = async (c) => {
    calls.push(c);
    if (c.audio?.mandatory) {   // tab capture: audio + video off one stream id
      if (!audio) throw new Error('NotReadableError');
      return new FakeStream([track('video', 'tab'), track('audio', 'tab')]);
    }
    if (c.audio === true) {     // the microphone
      if (mic !== 'ok') throw new Error('NotAllowedError');
      return new FakeStream([track('audio', 'mic')]);
    }
    return new FakeStream([track('video', 'tab')]);
  };

  const MediaRecorder = FakeRec;
  MediaRecorder.isTypeSupported = supports;

  const env = {
    chrome: chromeStub ?? {
      runtime: {
        onMessage: { addListener() {} },
        sendMessage: async (m) => { sent.push(m); },
      },
    },
    navigator: { mediaDevices: { getUserMedia } },
    MediaRecorder,
    AudioContext: FakeCtx,
    MediaStream: FakeStream,
    // data: URLs are the screenshot; everything else is Supabase saying yes.
    fetch: async (url) => (String(url).startsWith('data:')
      ? { blob: async () => new Blob(['png']) }
      : { ok: true, status: 200, text: async () => '' }),
    SUPABASE_URL: 'https://db.test',
    SUPABASE_ANON: 'anon',
    createImageBitmap: async () => new FakeBitmap(2560, 1440),
    OffscreenCanvas: FakeCanvas,
  };
  const api = new Function(...Object.keys(env), `${source}\nreturn { handle };`)(...Object.values(env));
  return { ...api, calls, sent, ctx: () => FakeCtx.last, rec: () => FakeRec.last };
}

const state = (sent, s) => sent.map((m) => m.state).find((x) => x?.s === s);

/**
 * worker.js and offscreen.js wired to each other over one stubbed
 * chrome.runtime, because the thing most likely to break between them is the
 * message contract itself — `mic` spelled one way in the worker and another in
 * the recorder is a silent no-op in every unit test written on one side.
 */
const worker = readFileSync(`${__dirname}/extension/worker.js`, 'utf8');

const DASH = 'https://dash.test';

function wired({ url = 'https://app.example/page', fjMic = false, session = null, ...opts } = {}) {
  const ui = [];                       // what the widget in the tab would receive
  const opened = [];                   // tabs the worker was asked to open
  let off = null, bg = null;
  const chromeStub = {
    runtime: {
      onMessage: { addListener() {} },
      onStartup: { addListener() {} },
      onInstalled: { addListener() {} },
      getURL: (p) => `chrome-extension://id/${p}`,
      sendMessage: async (m) => (m.to === 'off' ? off.handle(m, {}) : bg.route(m, {})),
    },
    tabs: {
      query: async () => [{ id: 3, url, windowId: 1 }],
      sendMessage: async (id, m) => { ui.push(m); },
      captureVisibleTab: async () => 'data:image/png;base64,x',
      create: async (o) => { opened.push(o); return { id: 99 }; },
      remove: async () => {},
      onRemoved: { addListener() {} },
      onUpdated: { addListener() {}, removeListener() {} },
    },
    scripting: { executeScript: async () => {} },
    storage: { local: { get: async () => ({ fjMic }) } },
    tabCapture: { getMediaStreamId: async () => 'sid' },
    offscreen: { hasDocument: async () => true, createDocument: async () => {} },
    commands: { onCommand: { addListener() {} } },
  };
  off = boot({ ...opts, chrome: chromeStub });
  // auth.js is not loaded here (it needs chrome.cookies); the three things
  // worker.js reads from it are passed in instead.
  bg = new Function('chrome', 'importScripts', 'DASH', 'fjSession', 'fjSessionState',
    `${worker}\nreturn { route };`)(
    chromeStub, () => {}, DASH,
    async () => session,
    async () => ({ state: session ? 'live' : 'none', session, origin: DASH }),
  );
  return { ...off, ui, opened, route: (m) => bg.route(m, {}) };
}

(async () => {
  // ── tab audio, no mic ─────────────────────────────────────────────────────
  {
    const o = boot({ mic: 'off', sound: true });
    await o.handle({ t: 'start', streamId: 'sid', tabId: 1, mic: false });

    assert.equal(o.calls.length, 1, 'one getUserMedia: picture and sound share the stream id');
    assert.equal(o.calls[0].audio.mandatory.chromeMediaSourceId, 'sid');
    assert.equal(o.calls[0].video.mandatory.maxWidth, 1280, 'the width cap survives');

    const ctx = o.ctx();
    const tabSrc = ctx.sources[0];
    assert.ok(tabSrc.out.includes(ctx.destination),
      'the tab audio is piped back to the speakers — recording a tab must not mute it');
    assert.ok(tabSrc.out.includes(ctx.mix), 'and into the recording');
    assert.equal(ctx.sources.length, 1, 'no mic source when the mic is off');

    const recorded = o.rec().stream;
    assert.equal(recorded.getVideoTracks().length, 1);
    assert.equal(recorded.getAudioTracks()[0].label, 'mixed');
    assert.match(o.rec().opts.mimeType, /opus/, 'an audio track means an audio codec in the mime');

    await o.handle({ t: 'stop' });
    assert.equal(state(o.sent, 'compose').mic, null, 'nothing to say about a mic nobody asked for');
    await o.handle({ t: 'discard' });
  }

  // ── mic on: mixed with the tab, and released afterwards ───────────────────
  {
    const o = boot({ sound: true });
    await o.handle({ t: 'start', streamId: 'sid', tabId: 1, mic: true });

    assert.deepEqual(o.calls[1], { audio: true }, 'the mic is a plain getUserMedia');
    const ctx = o.ctx();
    assert.equal(ctx.sources.length, 2, 'tab and mic both feed the mix');
    const micSrc = ctx.sources.find((s) => s.label === 'mic');
    assert.ok(micSrc.out.includes(ctx.mix), 'the mic reaches the recording');
    assert.ok(!micSrc.out.includes(ctx.destination),
      'the mic must NOT reach the speakers — that is a feedback loop');

    await o.handle({ t: 'stop' });
    assert.ok(ctx.closed, 'the audio graph is closed when the recording stops');
    const compose = state(o.sent, 'compose');
    assert.equal(compose.kind, 'video');
    assert.equal(compose.mic, 'on');
    await o.handle({ t: 'discard' });
  }

  // ── a denied mic is not a failed recording ────────────────────────────────
  {
    const o = boot({ mic: 'denied', sound: true });
    await o.handle({ t: 'start', streamId: 'sid', tabId: 1, mic: true });
    assert.ok(state(o.sent, 'rec'), 'recording starts anyway');
    assert.equal(o.ctx().sources.length, 1, 'tab audio only');
    await o.handle({ t: 'stop' });
    assert.equal(state(o.sent, 'compose').mic, 'denied',
      'the composer says so — a silent recording is otherwise found out on the dashboard');
    await o.handle({ t: 'discard' });
  }

  // ── a tab that will not hand over its audio still records ─────────────────
  {
    const o = boot({ audio: false, mic: 'off', sound: true });
    await o.handle({ t: 'start', streamId: 'sid', tabId: 1, mic: false });
    assert.equal(o.calls.length, 2, 'one retry, video only');
    assert.equal(o.calls[1].audio, undefined);
    assert.equal(o.ctx(), null, 'no audio graph with nothing to put in it');
    assert.doesNotMatch(o.rec().opts.mimeType, /opus/,
      'no audio track means no audio codec — a mime that names one Chrome cannot fill');
    await o.handle({ t: 'discard' });
  }

  // ── the mic light goes out ────────────────────────────────────────────────
  {
    const o = boot({ sound: true });
    await o.handle({ t: 'start', streamId: 'sid', tabId: 1, mic: true });
    const mixed = o.rec().stream;
    await o.handle({ t: 'discard' });
    assert.ok(mixed.getVideoTracks()[0].stopped, 'the tab track is stopped');
    // the mic stream is not the recorded one; it is held separately and must
    // be stopped too, or Chrome keeps showing "this extension is recording".
    assert.ok(o.calls.length === 2);
    assert.ok(o.ctx().closed);
  }

  // ── the mic flag does not leak into the next recording ────────────────────
  {
    const o = boot({ sound: true });
    await o.handle({ t: 'start', streamId: 'a', tabId: 1, mic: true });
    await o.handle({ t: 'discard' });
    o.sent.length = 0;
    await o.handle({ t: 'start', streamId: 'b', tabId: 1, mic: false });
    await o.handle({ t: 'stop' });
    assert.equal(state(o.sent, 'compose').mic, null, 'the next recording asked for no mic');
    await o.handle({ t: 'discard' });
  }

  // ── screenshots: capture, then select, then compose ───────────────────────
  {
    const o = boot({ mic: 'off' });
    await o.handle({ t: 'shot', dataUrl: 'data:image/png;base64,x', tabId: 5 });
    assert.ok(state(o.sent, 'crop'), 'the picture is taken first and the page asks for a selection');
    assert.ok(!state(o.sent, 'compose'), 'nothing to compose until the area is picked');

    // 1280 CSS px wide viewport, 2560 px capture: everything scales by 2
    await o.handle({ t: 'crop', rect: { x: 100, y: 50, w: 400, h: 200 }, vw: 1280 });
    assert.deepEqual(FakeCanvas.last.drew, [200, 100, 800, 400, 0, 0, 800, 400],
      'the rect is scaled by the image, not by devicePixelRatio');
    const compose = state(o.sent, 'compose');
    assert.equal(compose.kind, 'shot');
    assert.equal(compose.dims, '800×400', 'the composer says how big it is');
    assert.equal(compose.dur, 0, 'a screenshot has no duration');
    await o.handle({ t: 'discard' });
  }
  {
    // a click, not a drag: the whole visible tab
    const o = boot({ mic: 'off' });
    await o.handle({ t: 'shot', dataUrl: 'data:image/png;base64,x', tabId: 5 });
    await o.handle({ t: 'crop', rect: null, vw: 1280 });
    assert.deepEqual(FakeCanvas.last.drew, [0, 0, 2560, 1440, 0, 0, 2560, 1440]);
    await o.handle({ t: 'discard' });
  }
  {
    // a selection dragged off the edge is clamped, never a crop past the image
    const o = boot({ mic: 'off' });
    await o.handle({ t: 'shot', dataUrl: 'data:image/png;base64,x', tabId: 5 });
    await o.handle({ t: 'crop', rect: { x: 1200, y: 700, w: 400, h: 400 }, vw: 1280 });
    assert.deepEqual(FakeCanvas.last.drew, [2400, 1400, 160, 40, 0, 0, 160, 40]);
    await o.handle({ t: 'discard' });

    // and Escape — a discard mid-selection leaves nothing behind to crop
    await o.handle({ t: 'shot', dataUrl: 'data:image/png;base64,x', tabId: 5 });
    await o.handle({ t: 'discard' });
    const r = await o.handle({ t: 'crop', rect: null, vw: 1280 });
    assert.match(r.err, /Nothing to crop/);
  }
  {
    const o = boot({ mic: 'off' });

    // and it cannot land on top of a recording — even one in another tab,
    // which `state?` reports as idle.
    await o.handle({ t: 'start', streamId: 'sid', tabId: 9, mic: false });
    const r = await o.handle({ t: 'shot', dataUrl: 'data:image/png;base64,x', tabId: 5 });
    assert.match(r.err, /in progress/, 'a shot mid-recording is refused, not silently swapped in');
    assert.equal((await o.handle({ t: 'state?', tabId: 9 })).s, 'rec', 'the recording is untouched');
    const busy = await o.handle({ t: 'start', streamId: 'sid2', tabId: 9, mic: false });
    assert.match(busy.err, /already in progress/, 'nor a second recording');
    await o.handle({ t: 'discard' });
  }

  // ── what a navigation finds in flight ─────────────────────────────────────
  // A widget is re-injected on every page load and asks. Answering 'rec' for a
  // capture that is really waiting to be written up put a stop button over the
  // composer — and a stop on a screenshot composes a video with no video in it.
  {
    const o = boot({ mic: 'off' });
    await o.handle({ t: 'shot', dataUrl: 'data:image/png;base64,x', tabId: 5 });
    assert.equal((await o.handle({ t: 'state?', tabId: 5 })).s, 'crop', 'still picking an area');
    await o.handle({ t: 'crop', rect: null, vw: 1280 });
    const asked = await o.handle({ t: 'state?', tabId: 5 });
    assert.equal(asked.s, 'compose', 'now waiting for a title');
    assert.equal(asked.kind, 'shot', 'and the whole state comes back, not just its name');
    assert.equal((await o.handle({ t: 'state?', tabId: 6 })).s, 'idle', 'another tab sees nothing');
    await o.handle({ t: 'discard' });
    assert.equal((await o.handle({ t: 'state?', tabId: 5 })).s, 'idle');
  }
  {
    // and a recording still answers 'rec' — the hotkey's stop depends on it
    const o = boot({ mic: 'off' });
    await o.handle({ t: 'start', streamId: 'sid', tabId: 5, mic: false });
    const r = await o.handle({ t: 'state?', tabId: 5 });
    assert.equal(r.s, 'rec');
    assert.ok(r.t0 > 0, 'with the clock it needs to keep ticking');
    await o.handle({ t: 'discard' });
  }

  // ── worker ↔ offscreen, over the real messages ────────────────────────────
  {
    // the mic switch lives in storage, because the hotkey never opens the popup
    const o = wired({ fjMic: true, sound: true });
    await o.route({ to: 'bg', t: 'record' });
    assert.deepEqual(o.calls[1], { audio: true }, 'the worker passed the stored mic setting through');
    assert.ok(o.ui.some((m) => m.s === 'rec'), 'and the widget was told to show the bar');
    await o.route({ to: 'bg', t: 'discard' });
  }
  {
    const o = wired();
    await o.route({ to: 'bg', t: 'record' });
    assert.equal(o.calls.length, 1, 'no mic asked for when the switch is off');
    // a screenshot cannot land on top of it, and the refusal reaches the popup
    await assert.rejects(o.route({ to: 'bg', t: 'shot' }), /in progress/);
    await o.route({ to: 'bg', t: 'discard' });
    await o.route({ to: 'bg', t: 'shot' });
    assert.equal(o.ui.at(-1).s, 'crop', 'and it asks for a selection once nothing is running');
    // the selection comes back through the worker, from the content script
    await o.route({ to: 'bg', t: 'crop', rect: { x: 0, y: 0, w: 640, h: 360 }, vw: 1280 });
    assert.equal(o.ui.at(-1).kind, 'shot', 'and only then is there something to write up');
    assert.equal(o.ui.at(-1).dims, '1280×720');
    await o.route({ to: 'bg', t: 'discard' });
  }
  {
    const o = wired({ url: 'chrome://settings' });
    await assert.rejects(o.route({ to: 'bg', t: 'record' }), /Chrome's own pages/);
    await assert.rejects(o.route({ to: 'bg', t: 'shot' }), /Chrome's own pages/,
      'the screenshot path refuses them too — captureVisibleTab throws a worse message');
  }

  // ── shipped: no sound at all ──────────────────────────────────────────────
  // What actually ships today. AUDIO is off in offscreen.js, so a recording is
  // silent even with the mic switch left on in storage from before.
  {
    const o = wired({ fjMic: true });
    await o.route({ to: 'bg', t: 'record' });
    assert.equal(o.calls.length, 1, 'one getUserMedia, no retry');
    assert.equal(o.calls[0].audio, undefined, 'and no audio asked for');
    assert.equal(o.ctx(), null, 'no audio graph is built');
    assert.doesNotMatch(o.rec().opts.mimeType, /opus/, 'and no audio codec in the mime');
    await o.route({ to: 'bg', t: 'stop' });
    // wired up, the states arrive at the tab, not in the offscreen doc's outbox
    assert.equal(o.ui.find((m) => m.s === 'compose').mic, null, 'the composer says nothing about a mic');
    await o.route({ to: 'bg', t: 'discard' });
  }

  // ── the tab that opens when it lands ──────────────────────────────────────
  {
    const o = wired({ session: { user: { id: 'u1' }, access_token: 'tok' } });
    await o.route({ to: 'bg', t: 'record' });
    await o.route({ to: 'bg', t: 'stop' });
    await o.route({ to: 'bg', t: 'send', title: 'a title', desc: null,
                   env: { url: 'https://app.example/p', host: 'app.example' } });
    assert.ok(o.ui.some((m) => m.s === 'sent'), 'the widget says it landed');
    assert.match(o.opened.at(-1).url, /^https:\/\/dash\.test\/reports\/[0-9a-f-]{36}$/,
      'and the report it just filed is opened in a tab');
    assert.equal(o.opened.at(-1).active, false,
      'in the background — the page being reported on keeps the focus');
  }
  {
    // a failed upload opens nothing: a tab onto a report that was never
    // inserted is a 404, which reads as data loss
    const o = wired();                 // no session
    await o.route({ to: 'bg', t: 'record' });
    await o.route({ to: 'bg', t: 'stop' });
    await o.route({ to: 'bg', t: 'send', title: '', desc: null, env: {} });
    assert.ok(o.ui.some((m) => m.s === 'failed'), 'it says so');
    assert.equal(o.opened.length, 0, 'and opens nothing');
  }

  console.log('capture ok');
})();
