import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The parent Work/ folder has its own lockfile; without this Next infers the
  // workspace root as ~/Desktop/Work and warns on every build.
  turbopack: { root: __dirname },
};

export default nextConfig;
