// The marketing gradient (REKOD_DESIGN_SYSTEM.md §2.4) as an ordered-dither
// strip: each pixel is one of the two palette stops around it, picked by a
// 4×4 Bayer threshold — the pixel look CSS blend modes can't fake without
// greying the colours. Left to right only, so 4 rows tile vertically.
// Run: node apps/web/scripts/dusk.mjs   (no dependencies; writes PNGs)
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const STOPS = [
  [0, '#00022F'], [0.08, '#0C1942'], [0.24, '#142581'], [0.36, '#2539B8'], [0.44, '#395AD3'],
  [0.54, '#5B80EF'], [0.66, '#9091EB'], [0.8, '#F1B0E1'], [1, '#F4CDBE'],
];
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function pixel(x, y, w) {
  const t = x / (w - 1);
  let i = STOPS.findIndex((_, k) => t <= STOPS[k + 1]?.[0]);
  if (i < 0) i = STOPS.length - 2;
  const [p0, c0] = STOPS[i];
  const [p1, c1] = STOPS[i + 1];
  const f = (t - p0) / (p1 - p0);
  return rgb(f > (BAYER[y % 4][x % 4] + 0.5) / 16 ? c1 : c0);
}

// Minimal PNG: 8-bit RGB, filter 0 per row.
function png(w, h) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) raw.set(pixel(x, y, w), y * (1 + w * 3) + 1 + x * 3);
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  const crc = (b) => { let c = ~0; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return ~c >>> 0; };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const root = new URL('../../', import.meta.url);
// Columns ≈ the surface's width ÷ ~3px, so a dither pixel is about 3px square.
writeFileSync(new URL('web/public/dusk.png', root), png(256, 4));
writeFileSync(new URL('extension/dusk.png', root), png(88, 4));
// Full-bleed bands on the landing page (up to ~1440px wide): 480 columns keeps
// a dither pixel near 3px there, where the 256 strip would blow up to ~6px.
writeFileSync(new URL('web/public/dusk-wide.png', root), png(480, 4));
console.log('wrote apps/web/public/dusk.png (256×4), apps/web/public/dusk-wide.png (480×4), apps/extension/dusk.png (88×4)');
