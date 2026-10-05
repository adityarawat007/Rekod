// Fetches the landing page's four source photos into public/dither/ as small
// greyscale JPEGs. The page never shows them as photos: components/marketing/
// dither.tsx reads their pixels and draws a two-colour Bayer dither on a canvas
// (REKOD_DESIGN_SYSTEM.md "Landing page"). Run once; the files are committed.
//
// Run: node apps/web/scripts/photos.mjs
//
// All four are from Unsplash (two through picsum.photos), under the Unsplash License
// (free for commercial use, no permission needed; credit given here anyway):
//   54    Nicholas Swanson, peak above clouds  https://unsplash.com/photos/d19by2PLaPc
//   A0wvBW-Hjbs  Jeremy Bishop, sailboat      https://unsplash.com/photos/A0wvBW-Hjbs
//   62    Daniel Genser, misty hills            https://unsplash.com/photos/PzPbh-faPgU
//   K2HIvGR9CPQ  Leo_Visions, bridge with a walker  https://unsplash.com/photos/a-foggy-view-of-the-golden-gate-bridge-K2HIvGR9CPQ
import { writeFileSync, mkdirSync } from 'node:fs';

// Photos with a `url` are not on picsum: Unsplash's own download link (free
// photos only; an Unsplash+ photo would not download).
const PHOTOS = [
  { id: 54, file: 'peak.jpg', w: 1600, h: 1068 },
  { url: 'https://unsplash.com/photos/A0wvBW-Hjbs/download?force=true&w=1000', file: 'sailboat.jpg' },
  { id: 62, file: 'hills.jpg', w: 1600, h: 1066 },
  { url: 'https://unsplash.com/photos/K2HIvGR9CPQ/download?force=true&w=1000', file: 'bridge-walker.jpg' },
];

const dir = new URL('../public/dither/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const p of PHOTOS) {
  const r = await fetch(p.url ?? `https://picsum.photos/id/${p.id}/${p.w}/${p.h}?grayscale`);
  if (!r.ok) throw new Error(`${p.url ?? `picsum ${p.id}`}: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(new URL(p.file, dir), buf);
  console.log(`wrote apps/web/public/dither/${p.file} (${(buf.length / 1024).toFixed(0)} KB)`);
}
