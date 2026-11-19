/** @type {import('next').NextConfig} */

// Browser-hardening headers on every response (code review SEC-009).
// - No framing at all (clickjacking): nothing embeds this site. The desktop
//   app shows its pages in its own webview, not a frame, so it's unaffected.
// - The Content-Security-Policy isn't here: it needs a fresh nonce per
//   request, so proxy.ts sets it (lib/csp.ts). X-Frame-Options covers framing
//   on everything, including the static files the proxy doesn't see.
const securityHeaders = [
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
