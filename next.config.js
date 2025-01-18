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
    // Modify cache configuration
    config.cache = {
      type: 'memory',
      maxGenerations: 1,
    };

    return config;
  },
};

module.exports = nextConfig;
