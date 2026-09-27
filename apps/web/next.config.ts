import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The workspace root, where pnpm keeps the real node_modules. Pinned because
  // the parent Work/ folder has its own lockfile and Next would otherwise infer
  // ~/Desktop/Work and warn on every build.
  turbopack: { root: path.join(__dirname, '../..') },
};

export default nextConfig;
