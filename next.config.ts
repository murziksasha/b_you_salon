import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  experimental: {
    // Soft crossfade on App Router navigations (paired with styles/motion.scss)
    viewTransition: true,
  },
  sassOptions: {
    includePaths: [
      path.join(__dirname, 'src/sass'),
      path.join(__dirname, 'src'),
    ],
    // Must include legacy-js-api: this array replaces Next's default, which only silences that ID.
    // `import` is the Dart Sass 1.80+ deprecation that webpack cannot serialize into its cache.
    silenceDeprecations: ['legacy-js-api', 'import'],
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }],
      },
      {
        source: '/img/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/uploads/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
