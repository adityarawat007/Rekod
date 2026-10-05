// Packs apps/extension/ into the zip the landing page serves, and writes the
// facts the page shows about it. One command, every copy:
//
//   apps/web/public/rekod-extension.zip       the download (/rekod-extension.zip)
//   apps/web/src/lib/extension-release.json   version + size, read by the landing page
//   apps/web/public/rekod-extension-README.txt  the README, linked from the landing page
//
// Run: pnpm ext:zip   (from the repo root; no dependencies, no `zip` binary)
//
// The archive has one folder at its root, rekod-extension/, so "Load unpacked"
// points at exactly one thing. Entries are sorted and stamped with a fixed
// date, so the same source always makes the same bytes and a re-run with no
// change leaves git clean. test-logic.ts fails if the JSON's version is not
// manifest.json's, which is how a version bump without a re-run gets caught.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const src = join(root, 'apps/extension');
const out = join(root, 'apps/web/public/rekod-extension.zip');
const facts = join(root, 'apps/web/src/lib/extension-release.json');
const readme = join(root, 'apps/web/public/rekod-extension-README.txt');
const FOLDER = 'rekod-extension';

// Chrome loads everything in the folder, so only what the extension needs goes
// in. Dotfiles (.DS_Store, .env), dependency trees and lockfiles never ship.
const SKIP = (name) =>
  name.startsWith('.') ||
  name === 'node_modules' ||
  /^(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(name) ||
  /\.(zip|map|log)$/.test(name);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => !SKIP(d.name))
    .flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : d.isFile() ? [join(dir, d.name)] : []));
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const crc32 = (b) => { let c = ~0; for (const v of b) c = CRC[(c ^ v) & 255] ^ (c >>> 8); return ~c >>> 0; };

// 1 Jan 2026, 00:00, in DOS date/time: a fixed stamp keeps the output stable.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'));
const files = walk(src).sort();
if (!files.some((f) => relative(src, f) === 'manifest.json')) throw new Error(`no manifest.json in ${src}`);

const locals = [];
const centrals = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(`${FOLDER}/${relative(src, file).split(sep).join('/')}`);
  const data = readFileSync(file);
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);          // version needed
  local.writeUInt16LE(0x0800, 6);      // UTF-8 names
  local.writeUInt16LE(8, 8);           // deflate
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  locals.push(local, name, packed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix, so the mode below is read
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // -rw-r--r--
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);

  offset += local.length + name.length + packed.length;
}

const dir = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(dir.length, 12);
end.writeUInt32LE(offset, 16);

const zip = Buffer.concat([...locals, dir, end]);
writeFileSync(out, zip);
writeFileSync(readme, readFileSync(join(src, 'README.md')));
writeFileSync(facts, JSON.stringify({ version: manifest.version, bytes: zip.length, files: files.length }, null, 2) + '\n');

const kb = (zip.length / 1024).toFixed(0);
console.log(`ReKod ${manifest.version}: ${files.length} files, ${kb} KB`);
console.log(`  wrote ${relative(root, out)}`);
console.log(`  wrote ${relative(root, facts)}`);
console.log(`  wrote ${relative(root, readme)}`);
// Never let a stray file slip in unnoticed: say what shipped.
console.log(files.map((f) => `  + ${FOLDER}/${relative(src, f).split(sep).join('/')} (${statSync(f).size} B)`).join('\n'));
