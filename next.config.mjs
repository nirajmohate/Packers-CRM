/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { serverComponentsExternalPackages: ['mongoose', 'bcryptjs'] },
  async headers() {
    return [
      { source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
      // customer survey links: never indexed, never framed, and the secret link is not sent on to other sites
      { source: '/s/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'X-Frame-Options', value: 'DENY' }] },
    ];
  },
};
export default nextConfig;
