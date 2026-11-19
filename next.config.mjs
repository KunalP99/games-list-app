/** @type {import('next').NextConfig} */

// Browser-hardening headers on every response (code review SEC-009).
// - No framing at all (clickjacking): nothing embeds this site. The desktop
//   app shows its pages in its own webview, not a frame, so it's unaffected.
// - A full Content-Security-Policy is deliberately not here yet: YouTube
//   embeds, IGDB/RAWG images and Turnstile all need allowing, and getting one
//   wrong breaks pages. frame-ancestors is the part that matters most.
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // Browsers ignore this over plain http, so local development is unaffected.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
]

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'media.rawg.io',
        pathname: '/media/**',
      },
      {
        protocol: 'https',
        hostname: 'images.igdb.com',
        pathname: '/igdb/image/**',
      },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig;
