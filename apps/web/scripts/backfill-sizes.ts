// pnpm backfill-sizes
// One-off: sizes are recorded at create since 25 Nov 2026; this fills in the
// files uploaded before that, from the bucket's own listing. Safe to re-run.
import { listObjects } from '../src/lib/storage/s3.ts';
import { setAssetSize } from '../src/lib/server/admin.ts';

let n = 0, bytes = 0;
for await (const o of listObjects()) {
  await setAssetSize(o.key, o.size);
  n++; bytes += o.size;
  if (n % 200 === 0) console.log(`${n} objects…`);
}
console.log(`${n} objects, ${(bytes / 2 ** 20).toFixed(1)} MB in the bucket. Sizes written.`);
process.exit(0);
