// The rekod mark: a 9×9 pixel star with a white X at its centre. One source,
// every output: mark.svg (web + popup), the extension's toolbar PNGs on
// midnight, and the site favicon. Run: node apps/web/scripts/mark.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const G = ['000010000', '000111000', '001111100', '010111010', '111111111', '010111010', '001111100', '000111000', '000010000'];
const WHITE = new Set(['3,3', '5,3', '4,4', '3,5', '5,5']);
const BLUE = '#4A50F0', MIDNIGHT = '#00022F';
const cells = [...G.flatMap((r, y) => [...r].map((c, x) => (c === '1' ? [x, y] : null)))].filter(Boolean);
const path = (list) => list.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('');
const blue = cells.filter(([x, y]) => !WHITE.has(`${x},${y}`));
const white = cells.filter(([x, y]) => WHITE.has(`${x},${y}`));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9" shape-rendering="crispEdges"><path fill="${BLUE}" d="${path(blue)}"/><path fill="#fff" d="${path(white)}"/></svg>\n`;
const here = (p) => new URL(p, import.meta.url);
writeFileSync(here('../public/rekod-mark.svg'), svg);
mkdirSync(here('../../extension/icons/'), { recursive: true });
writeFileSync(here('../../extension/icons/mark.svg'), svg);

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = ~0; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return ~c >>> 0; };
const chunk = (t, d) => { const b = Buffer.concat([Buffer.from(t), d]), o = Buffer.alloc(4), e = Buffer.alloc(4); o.writeUInt32BE(d.length); e.writeUInt32BE(crc(b)); return Buffer.concat([o, b, e]); };

// Whole pixels per cell, so the edges stay hard at every size.
function png(size, scale) {
  const off = (size - 9 * scale) >> 1;
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const cx = Math.floor((x - off) / scale), cy = Math.floor((y - off) / scale);
      const on = cx >= 0 && cx < 9 && cy >= 0 && cy < 9 && G[cy][cx] === '1';
      raw.set(rgb(on ? (WHITE.has(`${cx},${cy}`) ? '#FFFFFF' : BLUE) : MIDNIGHT), y * (1 + size * 3) + 1 + x * 3);
    }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const [size, scale] of [[16, 1], [32, 3], [48, 5], [128, 13]]) writeFileSync(here(`../../extension/icons/${size}.png`), png(size, scale));
writeFileSync(here('../src/app/icon.png'), png(48, 5));
