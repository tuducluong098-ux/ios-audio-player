/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@distube/ytdl-core', 'jsdom', 'bgutils-js'],
  },
};

export default nextConfig;
