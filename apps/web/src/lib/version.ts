/** Dotted numeric versions, as manifest.json writes them: 0.10.0 > 0.9.9.
 *  A missing or malformed version is older than everything. */
export function olderThan(v: string | null, min: string) {
  if (!v || !/^\d+(\.\d+)*$/.test(v)) return true;
  const a = v.split('.').map(Number), b = min.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}
