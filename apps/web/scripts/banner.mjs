// README banner: the dusk palette (§2.4) as a vertical 4×4 Bayer dither with
// two dithered ridgelines. Run: node apps/web/scripts/banner.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const W = 400, H = 120, S = 4; // logical pixels, upscale factor
const STOPS = [[0, '#00022F'], [0.25, '#142581'], [0.5, '#395AD3'], [0.7, '#9091EB'], [0.88, '#F1B0E1'], [1, '#F4CDBE']];
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const bay = (x, y) => (BAYER[y % 4][x % 4] + 0.5) / 16;
const INK = rgb('#00022F'), MID = rgb('#0C1942'), PAPER = rgb('#F4F1EC');

const ridge = (x, a, b, c) => a + Math.sin(x * 0.045 + c) * b + Math.sin(x * 0.11 + c * 2.3) * b * 0.45 + Math.sin(x * 0.02 + c * 4) * b * 1.2;

function px(x, y) {
  const t = y / (H - 1);
  const i = STOPS.findIndex((_, k) => t <= STOPS[k + 1]?.[0]);
  const [p0, c0] = STOPS[i], [p1, c1] = STOPS[i + 1];
  let c = (t - p0) / (p1 - p0) > bay(x, y) ? rgb(c1) : rgb(c0);
  const r1 = ridge(x, 88, 8, 1), r2 = ridge(x, 100, 7, 4);
  if (y > r1 - 6 && y <= r1) c = (y - (r1 - 6)) / 6 > bay(x, y) ? MID : c; // haze fades into the far ridge
  if (y > r1) c = MID;
  if (y > r2 - 5 && y <= r2) c = (y - (r2 - 5)) / 5 > bay(x, y) ? INK : c;
  if (y > r2) c = INK;
  return c;
}

const w = W * S, h = H * S, raw = Buffer.alloc(h * (1 + w * 3));
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(px((x / S) | 0, (y / S) | 0), y * (1 + w * 3) + 1 + x * 3);
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = ~0; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return ~c >>> 0; };
const chunk = (t, d) => { const b = Buffer.concat([Buffer.from(t), d]), o = Buffer.alloc(4), e = Buffer.alloc(4); o.writeUInt32BE(d.length); e.writeUInt32BE(crc(b)); return Buffer.concat([o, b, e]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(new URL('../../../docs/banner.png', import.meta.url), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
