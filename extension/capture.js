// MAIN world, document_start. Patches the page's own console/fetch/XHR, keeps a
// rolling buffer, and hands it over when the widget asks. Never uploads anything.
(() => {
  // This one really does have to bail. Unlike widget.js — which is only UI and
  // can be swapped — everything below wraps console, fetch, XHR and WebSocket
  // IN PLACE. A second copy would wrap the first, so every log would be
  // recorded twice and every request logged twice. There is no un-patch, so a
  // changed capture.js needs a PAGE reload, not just an extension reload.
  if (window.__fjCapture) return;
  window.__fjCapture = 1;

  const WINDOW_MS = 300_000;   // must exceed the 3-min video cap
  const MAX = 5000;            // memory backstop; time is the primary rule
  const BODY_CAP = 100_000;

  const buf = [];
  let seq = 0;
  // `t` is spread over, so a caller that already knows when the thing happened
  // can say so. The fetch patch needs that: it writes its entry after the
  // response has been handed back, which can be up to READ_MS later.
  const push = (e) => {
    buf.push({ t: Date.now(), ...e, seq: ++seq });
    const cut = Date.now() - WINDOW_MS;
    while (buf.length && (buf[0].t < cut || buf.length > MAX)) buf.shift();
  };

  // Redact-then-truncate is the wrong order on a large value. fjScrub runs ~17
  // regexes and fjRedactBody a whole JSON.parse over whatever it is handed, so
  // one console.log of a 50 MB string froze the page to produce 2000
  // characters. Bound the input first.
  //
  // The pre-cap is BODY_CAP, not STR_CAP, on purpose: redaction still sees ~50x
  // more context than can ever be displayed, so it cannot be defeated by a
  // token that happens to straddle the cut.
  const STR_CAP = 2000;
  const pre = (s) => (typeof s === 'string' && s.length > BODY_CAP ? s.slice(0, BODY_CAP) : s);

  const str = (v) => {
    if (v instanceof Error) return fjScrub(pre(`${v.name}: ${v.message}\n${v.stack || ''}`)).slice(0, STR_CAP);
    if (typeof v === 'string') return fjScrub(pre(v)).slice(0, STR_CAP);
    // ponytail: no breadth budget on an object. fjRedact caps depth at 6 but
    // walks every key, so console.log of a 100k-element array still costs. Add
    // a node budget in redact.js if that ever shows up in a profile.
    try { return JSON.stringify(fjRedact(v))?.slice(0, STR_CAP) ?? String(v); }
    catch { return fjScrub(pre(String(v))).slice(0, STR_CAP); }
  };

  // --- console ---------------------------------------------------------
  for (const lvl of ['log', 'info', 'warn', 'error', 'debug']) {
    const orig = console[lvl].bind(console);
    console[lvl] = (...a) => { push({ kind: 'console', lvl, msg: a.map(str).join(' ') }); orig(...a); };
  }
  addEventListener('error', (e) => push({
    kind: 'console', lvl: 'error',
    msg: fjScrub(e.message || 'error'), stack: fjScrub(e.error?.stack || ''),
  }));
  addEventListener('unhandledrejection', (e) => push({
    kind: 'console', lvl: 'error', msg: 'Unhandled rejection: ' + str(e.reason),
  }));

  // --- network ---------------------------------------------------------
  const READ_MS = 2000;      // never hold the page's own fetch waiting for our copy

  const readable = (res) => {
    const ct = res.headers.get('content-type') || '';
    const len = +(res.headers.get('content-length') || 0);
    // event-stream is excluded by name: it matches /text/ and carries no
    // content-length, so this used to read "a body under 100 KB" from a
    // connection that never closes.
    return /json|text|xml|javascript/.test(ct) && !/event-stream/.test(ct) && len <= BODY_CAP;
  };

  // `.text()` on a clone reads the WHOLE body before anything is sliced, which
  // is unbounded on every response with no content-length. Read the clone's
  // stream, stop at the cap or the deadline, then cancel so the rest is never
  // transferred. Cancelling one branch of a tee leaves the branch the page is
  // reading untouched.
  const cappedText = async (r, cap) => {
    if (!r.body) return null;
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    const deadline = new Promise((res) => setTimeout(res, READ_MS, 'slow'));
    let out = '';
    try {
      while (out.length < cap) {
        const chunk = await Promise.race([reader.read(), deadline]);
        if (chunk === 'slow' || chunk.done) break;
        out += dec.decode(chunk.value, { stream: true });
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    return out.slice(0, cap);
  };

  // The per-entry ceiling in the report; BODY_CAP bounds what we read off the
  // wire, this bounds what we keep. Saying so in the payload matters: a silent
  // cut lands mid-structure, so the viewer's JSON.parse fails and it falls back
  // to printing one unbroken minified line.
  const CUT = 4000;
  const cut = (s) => (s == null ? null : s.length > CUT ? s.slice(0, CUT) + '\u2026[cut at 4 KB]' : s);

  const hdrs = (h) => {
    const o = {};
    try { h?.forEach((v, k) => { o[k] = v; }); } catch {}
    return fjRedactHeaders(o);
  };

  // Jam-style row categories. content-type first, filename second.
  const rtype = (ct, url) => {
    if (/^font\/|woff|ttf|otf|eot/.test(ct) || /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(url)) return 'font';
    if (/text\/css/.test(ct) || /\.css(\?|$)/i.test(url)) return 'css';
    if (/javascript|ecmascript/.test(ct) || /\.m?js(\?|$)/i.test(url)) return 'js';
    if (/^image\//.test(ct) || /\.(png|jpe?g|gif|webp|avif|svg|ico)(\?|$)/i.test(url)) return 'img';
    if (/^(video|audio)\//.test(ct)) return 'media';
    if (/text\/html/.test(ct)) return 'doc';
    return 'fetch';
  };

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const t = performance.now(), at = Date.now();
    let req;
    // Constructing a Request from a Request DISTURBS the original: the spec
    // marks the source body used, and handing it to fetch afterwards throws
    // "Cannot construct a Request with a Request object that has already been
    // used". Callers that pass a Request — Supabase's dashboard, anything with
    // fetch middleware — broke on every page this script touches.
    //
    // So `req` is what gets fetched from here on, never the caller's object.
    // The fallback still uses the originals: if construction threw, nothing was
    // consumed (a streaming body with no `duplex` lands here).
    try { req = new Request(input, init); } catch { return origFetch.call(this, input, init); }

    // Our two body copies are read ALONGSIDE the request, never in front of it.
    // Awaiting them here charged the page up to READ_MS per call — twice on a
    // POST — so an app that boots on a handful of streaming responses sat in
    // its own loading state for seconds it never spent on the network. The cost
    // of moving them off the path is that the entry is written late, hence the
    // explicit `t: at` and the duration measured the moment the response lands.
    // clone(), so reading the body leaves req itself intact to be sent.
    const reqBody = /^(GET|HEAD)$/i.test(req.method) ? null
      : cappedText(req.clone(), BODY_CAP).then(fjRedactBody).catch(() => null);
    const reqHeaders = hdrs(req.headers);
    try {
      const res = await origFetch.call(this, req);
      const dur = Math.round(performance.now() - t);
      const ct = res.headers.get('content-type') || '';
      // clone() has to happen now, while the body is still undisturbed; the
      // reading of it does not.
      const copy = readable(res) ? res.clone() : null;
      (async () => {
        let body = null;
        if (copy) { try { body = fjRedactBody(await cappedText(copy, BODY_CAP)); } catch {} }
        push({
          kind: 'net', t: at, method: req.method, url: fjRedactUrl(req.url), status: res.status,
          ms: dur, rtype: rtype(ct, req.url),
          reqHeaders, reqBody: cut(await reqBody),
          resHeaders: hdrs(res.headers), body: cut(body),
        });
      })().catch(() => {});   // never surface our own bookkeeping as a page error
      return res;
    } catch (err) {
      const dur = Math.round(performance.now() - t);
      Promise.resolve(reqBody).then((b) => push({
        kind: 'net', t: at, method: req.method, url: fjRedactUrl(req.url), status: 0,
        ms: dur, rtype: 'fetch', reqHeaders, reqBody: b ?? null, error: String(err),
      })).catch(() => {});
      throw err;
    }
  };

  const XO = XMLHttpRequest.prototype.open;
  const XS = XMLHttpRequest.prototype.send;
  const XH = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u, ...rest) {
    this.__fj = { m, u, t: 0, h: {}, b: null };
    return XO.call(this, m, u, ...rest);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (this.__fj) this.__fj.h[k] = v;
    return XH.call(this, k, v);
  };
  XMLHttpRequest.prototype.send = function (...a) {
    const meta = this.__fj;
    if (meta) {
      meta.t = performance.now();
      if (typeof a[0] === 'string') meta.b = fjRedactBody(a[0].slice(0, BODY_CAP));
      this.addEventListener('loadend', () => {
        let body = null;
        if (this.responseType === '' || this.responseType === 'text') {
          const txt = this.responseText || '';
          if (txt.length <= BODY_CAP) body = fjRedactBody(txt);
        }
        // getAllResponseHeaders() is a raw CRLF blob, not a Headers object
        const res = {};
        for (const line of (this.getAllResponseHeaders() || '').trim().split(/\r?\n/)) {
          const i = line.indexOf(':');
          if (i > 0) res[line.slice(0, i).trim()] = line.slice(i + 1).trim();
        }
        const ct = res['content-type'] || '';
        push({ kind: 'net', method: meta.m, url: fjRedactUrl(meta.u), status: this.status,
               ms: Math.round(performance.now() - meta.t), rtype: rtype(ct, meta.u),
               reqHeaders: fjRedactHeaders(meta.h || {}), reqBody: meta.b ?? null,
               resHeaders: fjRedactHeaders(res), body: cut(body) });
      });
    }
    return XS.apply(this, a);
  };

  // --- websockets -------------------------------------------------------
  // Invisible to both the fetch patch and the resource timeline: the constructor
  // is the only seam. A Proxy keeps statics, prototype and instanceof intact.
  const WS_FRAME_CAP = 200;   // ponytail: a chatty socket would evict everything else
  let wsN = 0;
  const OWS = window.WebSocket;
  if (OWS) {
    window.WebSocket = new Proxy(OWS, {
      construct(T, args) {
        const ws = new T(...args);
        const id = ++wsN, url = fjRedactUrl(String(args[0])), t = performance.now();
        let frames = 0;
        const emit = (ev, extra) => push({ kind: 'net', rtype: 'ws', method: 'WS', url, ws: id, ev, ...extra });
        // Discrete immutable entries, never a row mutated after the fact — the log
        // relay ships each entry once and can't resend an edited one.
        // On the real open event, not at construction. A socket that never
        // connected used to log an open it never had, and `status: null`
        // rendered as ERR on every healthy connection — 101 is the handshake's
        // actual status. A socket that fails has its 'error' row instead.
        ws.addEventListener('open', () => emit('open', {
          status: 101, ms: Math.round(performance.now() - t), protocols: args[1] ?? null,
        }));
        const frame = (dir, d) => {
          if (frames > WS_FRAME_CAP) return;
          if (++frames > WS_FRAME_CAP) return emit('frame', { dir, data: `[frame log capped at ${WS_FRAME_CAP}]` });
          emit('frame', {
            dir,
            data: typeof d === 'string' ? fjScrub(pre(d)).slice(0, 1000)
                : `[${d?.byteLength ?? d?.size ?? '?'} bytes binary]`,
          });
        };
        ws.addEventListener('message', (e) => frame('in', e.data));
        ws.addEventListener('error', () => emit('error', { status: 0, ms: Math.round(performance.now() - t) }));
        ws.addEventListener('close', (e) => emit('close', {
          status: e.wasClean ? null : 0, code: e.code, reason: e.reason || '',
          ms: Math.round(performance.now() - t),
        }));
        const send = ws.send.bind(ws);
        ws.send = (d) => { frame('out', d); return send(d); };
        return ws;
      },
    });
  }

  // --- passive resources ------------------------------------------------
  // fetch/XHR patching cannot see <link>, <script>, <img> or fonts. The resource
  // timeline can, and `buffered` back-fills everything loaded before we attached.
  const PO_TYPE = {
    link: 'css', css: 'css', script: 'js', img: 'img', image: 'img',
    video: 'media', audio: 'media', iframe: 'doc', navigation: 'doc',
  };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        // fetch and XHR are already captured above, with status and bodies
        if (e.initiatorType === 'fetch' || e.initiatorType === 'xmlhttprequest') continue;
        const t = PO_TYPE[e.initiatorType] || rtype('', e.name);
        push({
          kind: 'net', method: 'GET', url: fjRedactUrl(e.name),
          status: e.responseStatus ?? null,      // null = the browser did not expose one
          ms: Math.round(e.duration), rtype: t, size: e.transferSize || 0, passive: true,
        });
      }
    }).observe({ type: 'resource', buffered: true });
  } catch {}

  // --- page events ------------------------------------------------------
  const event = (ev, msg) => push({ kind: 'event', ev, msg });
  event('nav', 'Navigated to ' + fjRedactUrl(location.href));
  addEventListener('visibilitychange', () =>
    event('vis', 'Tab became ' + (document.hidden ? 'hidden' : 'visible')));
  addEventListener('pagehide', () => event('nav', 'Left ' + fjRedactUrl(location.href)));

  // SPA route changes never reload the document, so history has to be patched.
  for (const m of ['pushState', 'replaceState']) {
    const orig = history[m];
    history[m] = function (...a) {
      const r = orig.apply(this, a);
      event('nav', 'Routed to ' + fjRedactUrl(location.href));
      return r;
    };
  }
  addEventListener('popstate', () => event('nav', 'Back/forward to ' + fjRedactUrl(location.href)));

  // --- environment -----------------------------------------------------
  const env = () => {
    let gpu = null;
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      if (ext) gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    } catch {}
    return {
      ua: navigator.userAgent,
      url: fjRedactUrl(location.href),
      host: location.hostname,
      viewport: `${innerWidth}x${innerHeight}`,
      dpr: devicePixelRatio,
      gpu,
      build: document.querySelector('meta[name="build"], meta[name="build-sha"]')?.content || null,
    };
  };

  // --- handover --------------------------------------------------------
  // A CustomEvent on window, not postMessage. The DOM is shared across worlds
  // either way, but a `message` event is delivered to every listener on the
  // page — and this fires every 2s, so MetaMask's stream demuxer logged
  // "ObjectMultiplex - orphaned data" and an EventEmitter leak warning on every
  // page the extension touched. Nothing listens for a bare event it does not
  // know the name of.
  addEventListener('__fjCollect', (ev) => {
    const after = +ev.detail || 0;
    // Pull with a cursor: whenever the widget attaches, the boot-time backlog is still here.
    // detail is a string: object payloads do not survive the world boundary.
    dispatchEvent(new CustomEvent('__fjData', {
      detail: JSON.stringify({ entries: buf.filter((e) => e.seq > after), env: env() }),
    }));
  });
})();
