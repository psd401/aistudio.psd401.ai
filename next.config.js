/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mantine/core', '@mantine/hooks', '@mantine/modals', '@mantine/notifications'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  output: 'standalone',
  images: {
    domains: ['images.clerk.dev'],
  },
  webpack: (config) => {
    config.cache = {
      type: 'filesystem',
      buildDependencies: {
        config: [__filename],
      },
      cacheDirectory: path.resolve(__dirname, '.next/cache'),
      maxAge: 5184000000, // 60 days
      compression: 'gzip',
      allowCollectingMemory: true,
      memoryCacheUnaffected: true,
    };
    return config;
  },
};

module.exports = nextConfig;
