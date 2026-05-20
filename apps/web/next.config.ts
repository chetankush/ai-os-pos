import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mehfil/types'],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
