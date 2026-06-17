import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent the app from being embedded in iframes (clickjacking defence)
  { key: 'X-Frame-Options',        value: 'DENY' },
  // Stop browsers from sniffing MIME types
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Only send the origin as referrer, no path/query info
  { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
  // Disable browser features that FINVA doesn't need
  { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=()' },
  // Force HTTPS for 1 year (Vercel already enforces this, belt-and-suspenders)
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  headers: async () => [
    // Security headers on all routes
    {
      source: '/(.*)',
      headers: securityHeaders,
    },
    // Correct MIME type for the web app manifest
    {
      source: '/manifest.json',
      headers: [{ key: 'Content-Type', value: 'application/manifest+json' }],
    },
  ],
};

export default nextConfig;
