// ISOLATED world. UI only, plus the bridge between the page's MAIN world and the
// offscreen document. Holds no recorder and no blob, so a navigation costs nothing.
(() => {
  if (window.__fjWidget) return;    // re-injected into a tab that already has us
  window.__fjWidget = 1;

  const CAP_WARN = 150_000;
  const CENTERED = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483647';

  const host = document.createElement('div');
  host.style.cssText = CENTERED;
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    *{box-sizing:border-box;font-family:system-ui,sans-serif}
    #ui{user-select:none}
    .bar,.card{background:#241C2C;border:1px solid #463A56;color:#EFE9F3;box-shadow:0 10px 32px -10px rgba(0,0,0,.65)}
    .bar{display:inline-flex;align-items:center;gap:11px;border-radius:100px;padding:8px 9px 8px 12px;font-size:13px;font-weight:600;cursor:grab}
    .bar.rec{border-color:#FF2D55;box-shadow:0 0 0 4px rgba(255,45,85,.16),0 10px 32px -10px rgba(0,0,0,.65)}
    .grip{display:grid;grid-template-columns:2px 2px;gap:3px;opacity:.45}
    .grip i{width:2px;height:2px;border-radius:50%;background:#EFE9F3;box-shadow:0 5px 0 #EFE9F3,0 10px 0 #EFE9F3}
    .dot{width:9px;height:9px;border-radius:50%;background:#FF2D55;flex:0 0 auto}
    .dot.live{animation:p 1.6s ease-in-out infinite}
    .dot.ok{background:#00A862}.dot.bad{background:#E5001E}
    @keyframes p{50%{opacity:.28}}
    @media (prefers-reduced-motion:reduce){.dot.live{animation:none}}
    .t{font-family:ui-monospace,monospace;font-variant-numeric:tabular-nums;color:#A99BB6;min-width:44px}
    .t.warn{color:#FFC400}
    button{border:0;border-radius:100px;padding:6px 13px;font-size:12px;font-weight:600;background:#FF2D55;color:#fff;cursor:pointer}
    button.ghost{background:transparent;color:#A99BB6;border:1px solid #463A56}
    button:focus-visible{outline:2px solid #A98BFF;outline-offset:2px}
    .card{width:330px;border-radius:13px;padding:14px;cursor:grab}
    .card h4{margin:0 0 9px;font-size:13px;display:flex;align-items:center;gap:8px}
    textarea{width:100%;height:60px;resize:none;background:#1B1424;border:1px solid #463A56;border-radius:8px;
             color:#EFE9F3;padding:9px;font-size:12px;font-family:inherit;user-select:text;cursor:auto}
    .facts{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0 12px;font-family:ui-monospace,monospace;font-size:10.5px;color:#A99BB6}
    .row{display:flex;gap:8px}
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

  const mount = () => {
    if (host.isConnected || !document.body) return;
    document.body.appendChild(host);
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
  const pull = () => new Promise((res) => {
    const onMsg = (ev) => {
      if (ev.source !== window || ev.data?.__flamjam !== 'data') return;
      removeEventListener('message', onMsg); res(ev.data);
    };
    addEventListener('message', onMsg);
    setTimeout(() => { removeEventListener('message', onMsg); res(null); }, 800);
    postMessage({ __flamjam: 'collect', after: lastSeq }, '*');
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

  // ── views ────────────────────────────────────────────────────────────
  const GRIP = '<span class="grip"><i></i><i></i></span>';
  const idle = () => { stopTicker(); ui.innerHTML = ''; };            // nothing on the page until asked

  const note = (cls, text) => { stopTicker(); ui.innerHTML =
    `<div class="bar"><span class="dot ${cls}"></span><span>${text}</span></div>`; };

  const recording = (t0) => {
    stopTicker();
    // Built ONCE. The ticker only writes text — rebuilding this every second
    // destroyed the buttons between mousedown and mouseup, eating the click.
    ui.innerHTML = `<div class="bar rec">${GRIP}<span class="dot live"></span>
      <span class="t" id="tm">00:00</span>
      <button id="s">Stop &amp; send</button><button id="c" class="ghost">Cancel</button></div>`;
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
    ui.innerHTML = `<div class="card"><h4>${GRIP} What went wrong?</h4>
      <textarea id="t" placeholder="Export button spins forever on the render page…"></textarea>
      <div class="facts"><span>${media}</span><span>✓ ${m.logs} logs</span>
        <span>✓ ${m.net} requests</span><span>✓ redacted</span></div>
      <div class="row"><button id="go" style="flex:1">Send report</button>
        <button id="no" class="ghost">Discard</button></div></div>`;
    const box = root.getElementById('t');
    box.focus();
    const go = async () => {
      note('', 'Uploading…');
      send({ t: 'send', title: box.value.trim() || 'Untitled report', env: await flush() });
    };
    root.getElementById('go').onclick = go;
    root.getElementById('no').onclick = () => send({ t: 'discard' });
    box.onkeydown = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go(); };
  };

  chrome.runtime.onMessage.addListener((m) => {
    if (m.t !== 'state') return;
    mount();
    if (m.s === 'rec')       recording(m.t0);
    if (m.s === 'compose')   compose(m);
    if (m.s === 'idle')      idle();
    if (m.s === 'uploading') note('', 'Uploading…');
    if (m.s === 'sent')    { note('ok', 'Sent ✓'); setTimeout(idle, 2500); }
    if (m.s === 'failed')  { note('bad', m.err || 'Upload failed'); console.warn('[flamjam]', m.err); setTimeout(idle, 6000); }
  });

  // A navigation mid-recording lands here: ask what is already in flight.
  chrome.runtime.sendMessage({ to: 'bg', t: 'hello' })
    .then((r) => { mount(); r?.s === 'rec' ? recording(r.t0) : idle(); })
    .catch(() => {});
})();
