// ISOLATED world. UI only, plus the bridge between the page's MAIN world and the
// offscreen document. Holds no recorder and no blob, so a navigation costs nothing.
(() => {
  // Retire whatever is already running and take over, rather than bail out.
  // worker.js re-injects into every open tab on an extension reload, and the
  // old `if (window.__fjWidget) return;` made that a no-op — the fresh file saw
  // the flag the PREVIOUS instance had set and returned, so a changed widget
  // only ever appeared after a page reload. This fires before our own listener
  // is registered below, so we never answer our own retirement.
  if (window.__fjWidget) dispatchEvent(new CustomEvent('__fjRetire'));
  window.__fjWidget = 1;

  // Every frame runs this file now (`all_frames` in the manifest), because the
  // MAIN-world capture in a subframe has no way to reach the worker on its own
  // — chrome.runtime lives here. What a subframe must NOT do is draw: one pill
  // per iframe, each with its own ticker and its own compose card, is what
  // `all_frames` costs if the UI is not held to the top frame.
  const TOP = window.top === window;

  const CAP_WARN = 150_000;
  const CENTERED = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483647';

  const host = document.createElement('div');
  host.style.cssText = CENTERED;
  const root = host.attachShadow({ mode: 'closed' });
  // This bar sits on somebody else's page, so it is built to read as an
  // instrument rather than as part of the site: near-black zinc (#18181B) on
  // every background, light or dark. The dashboard's light palette is for our
  // own surfaces — the composer card below, and popup.html.
  //
  // No webfont. A content script's @font-face is fetched under the HOST page's
  // CSP, so on any site with a font-src policy it silently falls back — a bar
  // that renders in a different face per site is worse than one honest stack.
  // Inter where it is installed, else the platform grotesque; the clock is the
  // platform mono with tabular figures so digits do not jitter.
  root.innerHTML = `<style>
    *{box-sizing:border-box}
    #ui{user-select:none;-webkit-font-smoothing:antialiased;letter-spacing:-.006em;font-size:13px;line-height:1.4;
        font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
    /* The pill stays near-black: it sits ON somebody else's page and has to read
       as an instrument against any background. A hairline of white inside and a
       single soft shadow outside is all the lift it needs. */
    .bar{background:#18181B;color:#FAFAFA;border-radius:12px;border:1px solid #09090B;
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.06),0 8px 24px -8px rgba(0,0,0,.45);
      display:inline-flex;align-items:center;gap:2px;padding:4px;cursor:grab}
    .bar:active{cursor:grabbing}
    .bar.msg{gap:8px;padding:8px 13px 8px 11px;font-size:12.5px;font-weight:500}

    /* Red is the record light and nothing else: a dot that breathes beside the
       clock. The stop button is a plain white square, the universal glyph. */
    .rec{display:inline-flex;align-items:center;gap:8px;padding:0 6px 0 9px}
    .rdot{position:relative;width:8px;height:8px;border-radius:50%;background:#DC2626;flex:0 0 auto}
    .rdot::after{content:"";position:absolute;inset:0;border-radius:inherit;
      box-shadow:0 0 0 0 rgba(229,0,30,.55);animation:live 1.8s cubic-bezier(.2,.6,.3,1) infinite}
    @keyframes live{to{box-shadow:0 0 0 7px rgba(229,0,30,0)}}
    @media (prefers-reduced-motion:reduce){.rdot::after{animation:none}}

    .stop{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;border:0;padding:0;
          background:rgba(255,255,255,.08);cursor:pointer;transition:background .12s}
    .stop::before{content:"";width:10px;height:10px;border-radius:2.5px;background:#FAFAFA}
    .stop:hover{background:rgba(255,255,255,.16)}
    .ico{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;padding:0;
         background:none;border:0;color:#A1A1AA;cursor:pointer;transition:background .12s,color .12s}
    .ico:hover{background:rgba(255,255,255,.08);color:#FAFAFA}
    .sep{width:1px;height:16px;background:rgba(255,255,255,.12);margin:0 3px}
    .t{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,monospace;font-variant-numeric:tabular-nums;
       font-size:12.5px;font-weight:500;letter-spacing:.01em;min-width:40px}
    .t.warn{color:#F07800}
    .dot{width:7px;height:7px;border-radius:50%;background:#71717A;flex:0 0 auto}
    .dot.ok{background:#00A862}.dot.bad{background:#DC2626}

    /* The card is a form, not chrome, so it wears the dashboard's light palette
       — same as popup.html. It floats over a page, so it keeps one soft shadow. */
    .card{width:356px;padding:14px;cursor:grab;background:#FFFFFF;color:#18181B;
          border:1px solid #E4E4E7;border-radius:12px;
          box-shadow:0 12px 32px -12px rgba(0,0,0,.22),0 2px 6px -2px rgba(0,0,0,.08)}
    .card h4{margin:0 0 10px;font-size:13.5px;font-weight:600;letter-spacing:-.012em}
    /* Two fields — a title and a write-up, both optional. Same skin, so the
       card reads as one form rather than two controls that met by accident. */
    textarea,input{display:block;width:100%;background:#FFFFFF;border:1px solid #E4E4E7;
             border-radius:8px;color:#18181B;padding:8px 10px;font:inherit;font-size:13px;letter-spacing:-.006em;
             user-select:text;cursor:auto;transition:border-color .12s,box-shadow .12s}
    input{font-weight:500}
    textarea{height:72px;resize:none;margin-top:6px;line-height:1.45}
    /* 400, not the input's 500: a heavy placeholder reads as a value somebody
       already typed. */
    ::placeholder{color:#A1A1AA;font-weight:400}
    :is(textarea,input):hover{border-color:#D4D4D8}
    :is(textarea,input):focus{outline:none;border-color:#71717A}
    .facts{display:flex;flex-wrap:wrap;gap:4px;margin:10px 0 12px;
           font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#52525B}
    .facts span{background:#F4F4F5;border-radius:6px;padding:3px 7px}
    .row{display:flex;gap:6px}
    .btn{border:1px solid #18181B;border-radius:8px;padding:7px 14px;font:inherit;font-size:13px;font-weight:500;
         background:#18181B;color:#FFFFFF;cursor:pointer;transition:background .12s,border-color .12s}
    .btn:hover{background:#27272A;border-color:#27272A}
    .btn.ghost{background:#FFFFFF;color:#18181B;border-color:#E4E4E7}
    .btn.ghost:hover{background:#F4F4F5;border-color:#E4E4E7}
    :is(.ico,.stop,.btn):focus-visible{outline:2px solid #A1A1AA;outline-offset:2px}

    /* The selection overlay. The picture was already taken when this appears —
       it dims the live page, it is never in the capture. Before the first drag
       the shade itself is the dim; once dragging starts the shade goes clear
       and the selection's 9999px box-shadow does the dimming instead, which is
       how the hole in the middle stays a real hole. */
    .shade{position:absolute;inset:0;cursor:crosshair;touch-action:none;background:rgba(9,9,11,.42)}
    .shade.live{background:transparent}
    .sel{display:none;position:absolute;border:1.5px solid #FFFFFF;border-radius:2px;
         box-shadow:0 0 0 1px rgba(9,9,11,.5),0 0 0 9999px rgba(9,9,11,.42)}
    .tip{position:absolute;top:14px;left:50%;transform:translateX(-50%);white-space:nowrap;
         background:#18181B;color:#FAFAFA;border:1px solid #09090B;border-radius:10px;padding:7px 12px;
         font-size:12.5px;font-weight:500;
         box-shadow:inset 0 0 0 1px rgba(255,255,255,.06),0 8px 24px -8px rgba(0,0,0,.5)}
    .tip span{color:#A1A1AA;margin:0 4px}
    .tip kbd{font:500 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#FAFAFA;
             background:rgba(255,255,255,.1);border-radius:5px;padding:3px 5px;margin-right:2px}
  </style><div id="ui"></div>`;
  const ui = root.getElementById('ui');

  const dead = () => !chrome.runtime?.id;          // extension reloaded under us
  const send = async (m) => {
    try { await chrome.runtime.sendMessage({ ...m, to: 'bg' }); }
    catch { note('bad', 'Extension reloaded — refresh this page'); }
  };
  const fmt = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  let ticker = null;
  const stopTicker = () => { clearInterval(ticker); ticker = null; };

  // ── position ─────────────────────────────────────────────────────────
  let pos = null;
  let cropping = false;          // the overlay owns the whole viewport while true
  const place = () => {
    if (cropping) return;
    if (!pos) { host.style.cssText = CENTERED; return; }
    const r = host.getBoundingClientRect();
    const x = Math.min(Math.max(0, pos.x), Math.max(0, innerWidth - r.width));
    const y = Math.min(Math.max(0, pos.y), Math.max(0, innerHeight - r.height));
    host.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:2147483647`;
  };
  if (TOP) {
    chrome.storage.local.get('fjPos').then(({ fjPos }) => { if (fjPos) { pos = fjPos; place(); } });
    addEventListener('resize', place);
  }

  // documentElement, not body. A React app hydrating over server HTML treats an
  // extra child of <body> as a mismatch (error #418) and removes it, which is
  // why the pill vanished on the first client render and again on every SPA
  // route change. Nothing reconciles <html>'s own children, and position:fixed
  // resolves against the viewport either way. It also means we can mount at
  // document_start instead of waiting for a body to exist.
  const mount = () => {
    if (!TOP || host.isConnected) return;   // subframes relay, they do not render
    document.documentElement.appendChild(host);
    place();                        // a remount would otherwise snap back to centre
  };

  // Pointer events, not the HTML5 drag API — that one is for data transfer and
  // hands you an unstyleable ghost image. Listener sits on the shadow root because
  // a closed root retargets events to the host, hiding which button was pressed.
  root.addEventListener('pointerdown', (e) => {
    if (cropping) return;        // that drag draws a selection, it does not move the bar
    if (e.button !== 0 || e.target.closest('button, textarea, input')) return;
    const r = host.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return;
      moved = true;
      pos = { x: ev.clientX - dx, y: ev.clientY - dy };
      place();
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      if (moved) chrome.storage.local.set({ fjPos: pos });
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });

  // ── log relay: pull from MAIN world with a cursor, forward to the buffer ──
  let lastSeq = 0;
  // CustomEvent, not postMessage — see the note in capture.js. `detail` crosses
  // the world boundary as a string only.
  const pull = () => new Promise((res) => {
    const done = (v) => { clearTimeout(timer); removeEventListener('__fjData', onData); res(v); };
    const onData = (ev) => { try { done(JSON.parse(ev.detail)); } catch { done(null); } };
    addEventListener('__fjData', onData);
    const timer = setTimeout(() => done(null), 800);
    dispatchEvent(new CustomEvent('__fjCollect', { detail: lastSeq }));
  });

  async function flush() {
    const d = await pull();
    if (d?.entries?.length) {
      try {
        await chrome.runtime.sendMessage({ to: 'bg', t: 'logs', entries: d.entries });
        lastSeq = Math.max(lastSeq, ...d.entries.map((e) => e.seq));   // only on success
      } catch {
        // Worker asleep or offscreen doc not up yet. Leave the cursor where it is so
        // the next tick re-sends this batch — nothing is lost.
      }
    }
    return d?.env || {};
  }
  const beat = setInterval(() => {
    if (dead()) { clearInterval(beat); stopTicker(); host.remove(); return; }
    mount(); flush();
  }, 2000);
  flush();

  // A newer copy of this file has just been injected over us. Same teardown as
  // the dead-runtime path, so two pills never share a page.
  addEventListener('__fjRetire', () => {
    clearInterval(beat); stopTicker(); cropping = false; host.remove();
    // The listener has to go too. Left attached, a retired instance still
    // answers every state message and re-mounts the host it just removed, so
    // two copies would race to render the same pill.
    if (TOP) chrome.runtime.onMessage.removeListener(onMsg);
  }, { once: true });

  // ── views ────────────────────────────────────────────────────────────
  // The whole bar is the drag handle, so there are no grip dots to explain.
  const X = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
            'stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  const idle = () => { stopTicker(); ui.innerHTML = ''; };            // nothing on the page until asked

  const note = (cls, text) => { stopTicker(); ui.innerHTML =
    `<div class="bar msg"><span class="dot ${cls}"></span><span>${text}</span></div>`; };

  const recording = (t0) => {
    stopTicker();
    // Built ONCE. The ticker only writes text — rebuilding this every second
    // destroyed the buttons between mousedown and mouseup, eating the click.
    // Both controls are icon-only, so both carry a title and an aria-label:
    // the square does more than stop, it hands you the composer.
    ui.innerHTML = `<div class="bar">
      <span class="rec"><span class="rdot"></span><span class="t" id="tm">00:00</span></span>
      <button class="stop" id="s" title="Stop and write it up"
              aria-label="Stop recording and write it up"></button>
      <span class="sep"></span>
      <button class="ico" id="c" title="Discard this Rekod"
              aria-label="Discard this Rekod">${X}</button></div>`;
    const tm = root.getElementById('tm');
    root.getElementById('s').onclick = () => send({ t: 'stop' });
    root.getElementById('c').onclick = () => send({ t: 'discard' });
    const tick = () => {
      const ms = Date.now() - t0, late = ms > CAP_WARN;
      tm.textContent = fmt(ms) + (late ? ' · wrapping up' : '');
      tm.classList.toggle('warn', late);
    };
    tick();
    ticker = setInterval(tick, 1000);
  };

  /**
   * Pick the area. The screenshot has already been taken — this is a dimmed
   * sheet over the live page, and what comes back is a rectangle in CSS pixels
   * plus the viewport width, which is what `cropShot` scales by.
   *
   * A click with no drag means the whole visible tab: that is the common case
   * and it costs nothing to keep it on the same gesture.
   */
  const crop = () => {
    // The sheet is pushed to the tab AND handed back to a fresh widget that
    // asks 'hello', so it can arrive twice in a row. One sheet.
    if (cropping) return;
    stopTicker();
    cropping = true;
    // No transform here: a transformed ancestor becomes the containing block
    // for fixed children, and the sheet would stop covering the viewport.
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
    ui.innerHTML = `<div class="shade" id="sh"><div class="sel" id="sel"></div>
      <div class="tip">Drag to select<span>·</span>click for the whole tab<span>·</span><kbd>Esc</kbd> cancels</div></div>`;
    const sh = root.getElementById('sh');
    const sel = root.getElementById('sel');
    let sx = 0, sy = 0, box = null;

    const done = (rect) => {
      cropping = false;
      removeEventListener('keydown', key, true);
      place();
      note('', 'Cropping…');
      send({ t: 'crop', rect, vw: innerWidth });   // null rect = the whole tab
    };
    // Capture phase: a page that swallows keydown must not swallow the escape
    // out of a mode it did not put anyone in.
    const key = (e) => {
      if (!cropping || e.key !== 'Escape') return;   // inert once the sheet is gone
      cropping = false;
      removeEventListener('keydown', key, true);
      place();
      send({ t: 'discard' });
    };
    addEventListener('keydown', key, true);
    // The picture is of THIS page. Navigate away and the sheet would be a
    // selection over something else entirely, so leaving cancels the shot.
    // ponytail: a sendMessage from pagehide usually lands. If it does not, the
    // capture stays parked until the next Escape or Discard — the ceiling is a
    // refused "Finish the capture in progress first", not a lost recording.
    addEventListener('pagehide', () => cropping && send({ t: 'discard' }), { once: true });

    // The capture is of the viewport as it was. Let the page scroll under the
    // sheet and the preview stops matching the picture, so the selection lands
    // somewhere else entirely.
    sh.onwheel = (e) => e.preventDefault();
    sh.onpointerdown = (e) => {
      if (e.button !== 0) return;       // a right-click is a context menu, not a drag
      sx = e.clientX; sy = e.clientY;
      box = { x: sx, y: sy, w: 0, h: 0 };
      sh.classList.add('live');
      sel.style.display = 'block';
      sh.setPointerCapture(e.pointerId);
    };
    sh.onpointermove = (e) => {
      if (!box) return;
      box = {
        x: Math.min(sx, e.clientX), y: Math.min(sy, e.clientY),
        w: Math.abs(e.clientX - sx), h: Math.abs(e.clientY - sy),
      };
      sel.style.left = `${box.x}px`; sel.style.top = `${box.y}px`;
      sel.style.width = `${box.w}px`; sel.style.height = `${box.h}px`;
    };
    sh.onpointerup = () => {
      const r = box;
      box = null;
      // Under 8px either way is a click, or a twitch on one — either way the
      // person meant the whole tab, not a 3-pixel PNG.
      done(r && r.w > 8 && r.h > 8 ? r : null);
    };
  };

  const compose = (m) => {
    stopTicker();
    const media = m.kind === 'shot'
      ? `screenshot${m.dims ? ` ${m.dims}` : ''}`
      : `${fmt(m.dur || 0)} video`;
    // `m.mic` only ever arrives while AUDIO is on in offscreen.js, which it is
    // not: recordings are silent, so there is nothing to announce. Kept because
    // a mic that was asked for and refused is the one capture failure nothing
    // else shows — the video looks fine and is silent where a voice should be.
    const audio = m.mic === 'on' ? '<span>mic</span>'
      : m.mic === 'denied' ? '<span style="color:#B45309">⚠ no mic — permission refused</span>' : '';
    // Both fields are optional and neither is a comment: the title and the
    // description are the report's own, editable later on the dashboard. The
    // comment thread only ever grows there. See schema-comments.sql.
    ui.innerHTML = `<div class="card"><h4>Save this Rekod</h4>
      <input id="ti" placeholder="Title (optional)">
      <textarea id="t" placeholder="What happened? Optional — you can write this later."></textarea>
      <div class="facts"><span>${media}</span>${audio}<span>${m.logs} logs</span>
        <span>${m.net} requests</span><span>redacted</span></div>
      <div class="row"><button class="btn" id="go" style="flex:1">Save Rekod</button>
        <button class="btn ghost" id="no">Discard</button></div></div>`;
    const name = root.getElementById('ti');
    const box = root.getElementById('t');
    name.focus();
    const go = async () => {
      note('', 'Uploading…');
      // Empty stays empty. `title` is NOT NULL in the database, so the blank is
      // '' rather than null, and the dashboard shows its placeholder.
      send({ t: 'send', title: name.value.trim(), desc: box.value.trim(), env: await flush() });
    };
    root.getElementById('go').onclick = go;
    root.getElementById('no').onclick = () => send({ t: 'discard' });
    const chord = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go(); };
    name.onkeydown = chord;
    box.onkeydown = chord;
  };

  const onMsg = (m) => {
    if (m.t !== 'state') return;
    mount();
    if (m.s !== 'crop') { cropping = false; place(); }   // any other state ends the sheet
    if (m.s === 'crop')      crop();
    if (m.s === 'rec')       recording(m.t0);
    if (m.s === 'compose')   compose(m);
    if (m.s === 'idle')      idle();
    if (m.s === 'uploading') note('', 'Uploading…');
    if (m.s === 'sent')    { note('ok', 'Sent — opened in a new tab'); setTimeout(idle, 2500); }
    if (m.s === 'failed')  { note('bad', m.err || 'Upload failed'); console.warn('[rekod]', m.err); setTimeout(idle, 6000); }
  };
  // Both of these are the UI's, so both are the top frame's. worker.js also
  // addresses state at frameId 0, so a subframe would never hear one anyway —
  // this is the half that stops it ASKING.
  if (TOP) {
    chrome.runtime.onMessage.addListener(onMsg);

    // A navigation mid-capture lands here: ask what is already in flight and
    // render it, whatever it is. Answering only 'rec' is what used to put a
    // recording bar over a capture that was really waiting to be written up.
    chrome.runtime.sendMessage({ to: 'bg', t: 'hello' })
      .then((r) => { mount(); r?.s && r.s !== 'idle' ? onMsg({ ...r, t: 'state' }) : idle(); })
      .catch(() => {});
  }
})();
