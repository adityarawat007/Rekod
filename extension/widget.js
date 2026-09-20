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

  const CAP_WARN = 150_000;
  const CENTERED = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483647';

  const host = document.createElement('div');
  host.style.cssText = CENTERED;
  const root = host.attachShadow({ mode: 'closed' });
  // This bar sits on somebody else's page, so it is built to read as an
  // instrument rather than as part of the site: near-black on every background,
  // light or dark. #17161A is Ink with the violet pulled almost out, so it is
  // still ours without being a tinted grey. The dashboard's light palette is
  // for our own surfaces — see popup.html.
  //
  // No webfont. A content script's @font-face is fetched under the HOST page's
  // CSP, so on any site with a font-src policy it silently falls back — a bar
  // that renders in a different face per site is worse than one honest stack.
  // The UI face is the platform grotesque (SF Pro / Segoe Variable), the clock
  // is the platform mono with tabular figures so digits do not jitter.
  root.innerHTML = `<style>
    *{box-sizing:border-box}
    #ui{user-select:none;-webkit-font-smoothing:antialiased;letter-spacing:-.01em;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI Variable Text","Segoe UI",Inter,Roboto,system-ui,sans-serif}
    .bar,.card{background:#17161A;color:#F5F2F6;border-radius:16px;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 12px 32px -10px rgba(0,0,0,.6),0 2px 10px -3px rgba(0,0,0,.45)}
    .bar{display:inline-flex;align-items:center;gap:2px;padding:6px;cursor:grab}
    .bar:active{cursor:grabbing}
    .bar.msg{gap:9px;padding:10px 15px 10px 12px;font-size:13px;font-weight:500}

    /* The stop button IS the recording indicator, so the surface keeps exactly
       one Jam-coloured element instead of a red dot competing with a red
       button. The ring breathes; nothing else on the bar moves. */
    .stop{position:relative;width:32px;height:32px;border-radius:11px;background:#FF2D55;border:0;padding:0;cursor:pointer}
    .stop::after{content:"";position:absolute;inset:0;border-radius:inherit;
      box-shadow:0 0 0 0 rgba(255,45,85,.5);animation:live 2.1s cubic-bezier(.2,.6,.3,1) infinite}
    @keyframes live{to{box-shadow:0 0 0 10px rgba(255,45,85,0)}}
    @media (prefers-reduced-motion:reduce){.stop::after{animation:none}}

    .ico{display:grid;place-items:center;width:32px;height:32px;border-radius:11px;padding:0;
         background:none;border:0;color:#9C95A2;cursor:pointer;transition:background .12s,color .12s}
    .ico:hover{background:rgba(255,255,255,.09);color:#F5F2F6}
    .sep{width:1px;height:18px;background:rgba(255,255,255,.13);margin:0 4px}
    .t{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,monospace;font-variant-numeric:tabular-nums;
       font-size:13px;font-weight:500;letter-spacing:.02em;padding:0 9px;min-width:52px;text-align:center}
    .t.warn{color:#FFC400}
    .dot{width:8px;height:8px;border-radius:50%;background:#FF2D55;flex:0 0 auto}
    .dot.ok{background:#00A862}.dot.bad{background:#FF5C6E}

    .card{width:340px;padding:15px;cursor:grab}
    .card h4{margin:0 0 10px;font-size:13.5px;font-weight:600}
    /* Two fields now — a title and a write-up, both optional. Same skin, so
       the card reads as one form rather than two controls that met by
       accident. */
    textarea,input{width:100%;background:#0F0E12;border:1px solid rgba(255,255,255,.12);
             border-radius:10px;color:#F5F2F6;padding:10px;font:inherit;font-size:12.5px;letter-spacing:0;
             user-select:text;cursor:auto}
    input{font-weight:600}
    textarea{height:64px;resize:none;margin-top:7px}
    ::placeholder{color:#6F6875}
    :is(textarea,input):focus{outline:none;border-color:rgba(255,255,255,.3)}
    .facts{display:flex;flex-wrap:wrap;gap:9px;margin:11px 0 13px;font-family:ui-monospace,monospace;
           font-size:10.5px;color:#9C95A2}
    .row{display:flex;gap:8px}
    .btn{border:0;border-radius:10px;padding:9px 14px;font:inherit;font-size:12.5px;font-weight:600;
         background:#FF2D55;color:#fff;cursor:pointer}
    .btn.ghost{background:rgba(255,255,255,.07);color:#CFC9D4}
    .btn.ghost:hover{background:rgba(255,255,255,.12);color:#F5F2F6}
    :is(.btn,.ico,.stop):focus-visible{outline:2px solid #A98BFF;outline-offset:2px}
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
  const place = () => {
    if (!pos) { host.style.cssText = CENTERED; return; }
    const r = host.getBoundingClientRect();
    const x = Math.min(Math.max(0, pos.x), Math.max(0, innerWidth - r.width));
    const y = Math.min(Math.max(0, pos.y), Math.max(0, innerHeight - r.height));
    host.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:2147483647`;
  };
  chrome.storage.local.get('fjPos').then(({ fjPos }) => { if (fjPos) { pos = fjPos; place(); } });
  addEventListener('resize', place);

  // documentElement, not body. A React app hydrating over server HTML treats an
  // extra child of <body> as a mismatch (error #418) and removes it, which is
  // why the pill vanished on the first client render and again on every SPA
  // route change. Nothing reconciles <html>'s own children, and position:fixed
  // resolves against the viewport either way. It also means we can mount at
  // document_start instead of waiting for a body to exist.
  const mount = () => {
    if (host.isConnected) return;
    document.documentElement.appendChild(host);
    place();                        // a remount would otherwise snap back to centre
  };

  // Pointer events, not the HTML5 drag API — that one is for data transfer and
  // hands you an unstyleable ghost image. Listener sits on the shadow root because
  // a closed root retargets events to the host, hiding which button was pressed.
  root.addEventListener('pointerdown', (e) => {
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
    clearInterval(beat); stopTicker(); host.remove();
    // The listener has to go too. Left attached, a retired instance still
    // answers every state message and re-mounts the host it just removed, so
    // two copies would race to render the same pill.
    chrome.runtime.onMessage.removeListener(onMsg);
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
      <button class="stop" id="s" title="Stop and write it up"
              aria-label="Stop recording and write it up"></button>
      <span class="t" id="tm">00:00</span>
      <span class="sep"></span>
      <button class="ico" id="c" title="Discard this recording"
              aria-label="Discard this recording">${X}</button></div>`;
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

  const compose = (m) => {
    stopTicker();
    const media = m.kind === 'shot' ? '✓ screenshot' : `✓ ${fmt(m.dur || 0)} video`;
    // Both fields are optional and neither is a comment: the title and the
    // description are the report's own, editable later on the dashboard. The
    // comment thread only ever grows there. See schema-comments.sql.
    ui.innerHTML = `<div class="card"><h4>Save this recording</h4>
      <input id="ti" placeholder="Title (optional)">
      <textarea id="t" placeholder="What happened? Optional — you can write this later."></textarea>
      <div class="facts"><span>${media}</span><span>✓ ${m.logs} logs</span>
        <span>✓ ${m.net} requests</span><span>✓ redacted</span></div>
      <div class="row"><button class="btn" id="go" style="flex:1">Save recording</button>
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
    if (m.s === 'rec')       recording(m.t0);
    if (m.s === 'compose')   compose(m);
    if (m.s === 'idle')      idle();
    if (m.s === 'uploading') note('', 'Uploading…');
    if (m.s === 'sent')    { note('ok', 'Sent ✓'); setTimeout(idle, 2500); }
    if (m.s === 'failed')  { note('bad', m.err || 'Upload failed'); console.warn('[rekod]', m.err); setTimeout(idle, 6000); }
  };
  chrome.runtime.onMessage.addListener(onMsg);

  // A navigation mid-recording lands here: ask what is already in flight.
  chrome.runtime.sendMessage({ to: 'bg', t: 'hello' })
    .then((r) => { mount(); r?.s === 'rec' ? recording(r.t0) : idle(); })
    .catch(() => {});
})();
