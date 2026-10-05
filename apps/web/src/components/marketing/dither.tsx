'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/** A photo as a two-colour ordered dither (4×4 Bayer, the same matrix as the
 *  §2.4 dusk), drawn on a canvas at one dither pixel per `px` CSS pixels and
 *  scaled up with `image-rendering: pixelated`. Colours come from CSS
 *  (--dither-ink / --dither-paper, marketing.css), so it follows the theme.
 *
 *  Motion, all of it skipped under prefers-reduced-motion:
 *  - develop: on load the image comes in darkest-first over ~1.6s, like a
 *    print developing (the threshold ramps from 0 to the full picture);
 *  - sweep: a band in the full dusk palette crosses the picture every 9s, the
 *    playhead of the login replay, while no pointer is over it.
 *  - lens: (opt-in) follows a mouse pointer and shows the dusk palette under it.
 *  With none of these it draws once and stays still. It is
 *  direct feedback, not autonomous motion, so it stays on under reduced motion.
 *
 *  Cost is capped: at most MAX_PX dither pixels (px grows past that), ~30fps,
 *  and nothing runs while the canvas is off screen. */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16);
const MAX_PX = 260_000;
const DEVELOP_MS = 1600;
const SWEEP_MS = 9000;

type RGB = [number, number, number];

function parseColor(v: string): RGB {
  const s = v.trim();
  if (s.startsWith('#')) {
    const h = s.length === 4 ? [...s.slice(1)].map((c) => c + c).join('') : s.slice(1, 7);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
  }
  const m = s.match(/\d+(\.\d+)?/g);
  return m ? (m.slice(0, 3).map(Number) as RGB) : [0, 0, 0];
}

/** RGBA packed for a little-endian Uint32Array view of ImageData. */
const pack = ([r, g, b]: RGB) => (255 << 24) | (b << 16) | (g << 8) | r;

function readTheme() {
  const css = getComputedStyle(document.documentElement);
  const stops = css
    .getPropertyValue('--dusk-stops')
    .split(',')
    .map((p) => p.trim().split(/\s+/))
    .filter((p) => p.length === 2)
    .map(([c, at]) => ({ at: Number(at), c: pack(parseColor(c)) }));
  return {
    ink: pack(parseColor(css.getPropertyValue('--dither-ink'))),
    paper: pack(parseColor(css.getPropertyValue('--dither-paper'))),
    invert: css.getPropertyValue('--dither-invert').trim() === '1',
    stops,
  };
}

/** Cover-fit the image into w×h and return per-pixel lightness in 0..1,
 *  stretched so the darkest 2% and lightest 2% hit the ends (a flat photo
 *  dithers to grey mush otherwise). */
function lightness(img: HTMLImageElement, w: number, h: number, focus: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  g.drawImage(img, (w - dw) * focus[0], (h - dh) * focus[1], dw, dh);
  const d = g.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0; i < out.length; i++) {
    const v = Math.round(d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114);
    out[i] = v;
    hist[v]++;
  }
  const cut = out.length * 0.02;
  let lo = 0, hi = 255, acc = 0;
  while (lo < 255 && (acc += hist[lo]) < cut) lo++;
  acc = 0;
  while (hi > 0 && (acc += hist[hi]) < cut) hi--;
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.max(0, (out[i] - lo) / span));
  return out;
}

export function Dither({
  src,
  className,
  px = 3,
  develop = false,
  sweep = false,
  lens: lensOn = false,
  focus = [0.5, 0.5],
  gamma = 0.6,
}: {
  src: string;
  className?: string;
  /** CSS pixels per dither pixel. */
  px?: number;
  develop?: boolean;
  sweep?: boolean;
  /** The dusk-palette lens under a mouse pointer. Off: the picture is static. */
  lens?: boolean;
  /** Where the cover crop is anchored, 0..1 on each axis (like object-position). */
  focus?: [number, number];
  /** Tone curve before dithering; below 1 means less ink, in both themes.
   *  Two-colour prints read best mostly paper, with ink for the shapes. */
  gamma?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fx, fy] = focus;

  useEffect(() => {
    const box = wrap.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

    let theme = readTheme();
    let img: HTMLImageElement | null = null;
    let L: Float32Array | null = null;
    // How much ink each pixel wants, per theme: light inks the darks, dark
    // (inverted) inks the lights. Built once per size, not per frame.
    let inkLight: Float32Array | null = null;
    let inkDark: Float32Array | null = null;
    const amounts = (l: Float32Array) => {
      inkLight = l.map((v) => 1 - v ** gamma);
      inkDark = l.map((v) => v ** (1 / gamma));
    };
    let w = 0, h = 0, scale = px;
    let frame: ImageData | null = null;
    let buf: Uint32Array | null = null;
    let raf = 0, last = 0, visible = true;
    const born = performance.now();
    let lens: { x: number; y: number } | null = null;

    let dirty = true;

    const developing = (now: number) => develop && !still && now - born < DEVELOP_MS;

    function resize() {
      const r = box.getBoundingClientRect();
      scale = px;
      while ((r.width / scale) * (r.height / scale) > MAX_PX) scale += 1;
      w = Math.max(1, Math.ceil(r.width / scale));
      h = Math.max(1, Math.ceil(r.height / scale));
      cv.width = w;
      cv.height = h;
      // Whole CSS pixels per dither pixel; the wrapper crops the overhang.
      cv.style.width = `${w * scale}px`;
      cv.style.height = `${h * scale}px`;
      frame = ctx.createImageData(w, h);
      buf = new Uint32Array(frame.data.buffer);

      L = img ? lightness(img, w, h, [fx, fy]) : null;
      if (L) amounts(L);
      dirty = true;
    }

    /** Dusk colour for lightness t, picked between the two stops around it. */
    function dusk(t: number, b: number) {
      const s = theme.stops;
      let i = 0;
      while (i < s.length - 2 && t > s[i + 1].at) i++;
      const f = (t - s[i].at) / (s[i + 1].at - s[i].at || 1);
      return f > b ? s[i + 1].c : s[i].c;
    }

    function draw(now: number) {
      if (!L || !buf || !frame) return;
      const A = (theme.invert ? inkDark : inkLight)!;
      const t = develop && !still ? Math.min(1, (now - born) / DEVELOP_MS) : 1;
      const k = 1 - (1 - t) ** 3; // ease-out
      const { ink, paper } = theme;
      // The sweep band, in dither pixels; off while the lens is up or developing.
      const band = Math.max(10, Math.round(w * 0.04));
      const sx = sweep && !still && !lens && t >= 1 ? (((now - born) % SWEEP_MS) / SWEEP_MS) * (w + band * 2) - band : -1e9;
      const r = Math.max(14, Math.round(Math.min(w, h) * 0.12));
      const r2 = r * r;
      for (let y = 0; y < h; y++) {
        const row = y * w;
        const by = (y & 3) * 4;
        const dy = lens ? (y - lens.y) ** 2 : 0;
        for (let x = 0; x < w; x++) {
          const l = L[row + x];
          const b = BAYER[by + (x & 3)];
          if ((lens && (x - lens.x) ** 2 + dy < r2) || (x >= sx && x < sx + band)) {
            buf[row + x] = dusk(l, b);
            continue;
          }
          const a = A[row + x];
          buf[row + x] = a * k > b ? ink : paper;
        }
      }
      ctx.putImageData(frame, 0, 0);
    }

    function tick(now: number) {
      raf = 0;
      if (!visible) return;
      const moving = developing(now) || (sweep && !still);
      // ~30fps is plenty for a 3px dither and halves the work.
      if (dirty || (moving && now - last > 32)) {
        draw(now);
        last = now;
        dirty = false;
      }
      if (moving || dirty) raf = requestAnimationFrame(tick);
    }
    const kick = () => {
      if (!raf && visible) raf = requestAnimationFrame(tick);
    };

    const ro = new ResizeObserver(() => {
      resize();
      kick();
    });
    ro.observe(box);

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) kick();
    });
    io.observe(box);

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const r = box.getBoundingClientRect();
      lens = { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
      dirty = true;
      kick();
    };
    const onLeave = () => {
      lens = null;
      dirty = true;
      kick();
    };
    if (lensOn) {
      box.addEventListener('pointermove', onMove);
      box.addEventListener('pointerleave', onLeave);
    }

    // The theme can change under us: the toggle (data-theme) or the system.
    const retheme = () => {
      theme = readTheme();
      dirty = true;
      kick();
    };
    const mo = new MutationObserver(retheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', retheme);

    const im = new Image();
    im.decoding = 'async';
    im.onload = () => {
      img = im;
      // The image can land before the first measure, while w and h are still
      // 0; getImageData throws on a 0-wide canvas. resize() measures, then
      // samples the image itself now that it is set.
      if (!w || !h) resize();
      else {
        L = lightness(im, w, h, [fx, fy]);
        amounts(L);
        dirty = true;
      }
      kick();
    };
    im.src = src;

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      mq.removeEventListener('change', retheme);
      box.removeEventListener('pointermove', onMove);
      box.removeEventListener('pointerleave', onLeave);

      im.onload = null;
    };
  }, [src, px, develop, sweep, lensOn, fx, fy, gamma]);

  return (
    <div ref={wrap} aria-hidden className={cn('overflow-hidden bg-(--dither-paper)', className)}>
      <canvas ref={canvas} className="block [image-rendering:pixelated]" />
    </div>
  );
}
