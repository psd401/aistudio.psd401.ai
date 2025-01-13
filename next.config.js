/** @type {import('next').NextConfig} */
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
};

module.exports = nextConfig;
