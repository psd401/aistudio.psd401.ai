/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  output: 'standalone',
  images: {
    remotePatterns: [],
  },
  devIndicators: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
      // Increase the timeout for server actions
      timeout: 300
    },
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
