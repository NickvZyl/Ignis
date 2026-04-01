import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  ...(process.env.BUILD_MODE === 'mobile' ? { output: 'export' } : {}),
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname, '../src');
    config.resolve.alias['@web'] = path.resolve(__dirname, './');
    return config;
  },
  turbopack: {
    resolveAlias: {
      '@': path.resolve(__dirname, '../src'),
      '@web': path.resolve(__dirname, './'),
    },
  },
};

export default nextConfig;
