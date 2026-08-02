/** @type {import('next').NextConfig} */
const nextConfig = {
  // @sparticuz/chromium ships a native Chromium binary that webpack must not
  // try to bundle/tree-shake — it needs to stay a plain runtime dependency
  // resolved by Node at request time (used by Angeles's browse_page tool).
  // This is `experimental.serverComponentsExternalPackages` on Next 14.x —
  // it was only renamed to the stable top-level `serverExternalPackages` in
  // Next 15.
  experimental: {
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
    // serverComponentsExternalPackages alone isn't enough: Next's file
    // tracer only bundles what it can statically see a route importing, and
    // @sparticuz/chromium extracts its actual Chromium binary + shared
    // libraries (e.g. libnss3.so) from a brotli archive at runtime — a
    // reference the tracer has no way to detect. Without force-including
    // the whole package here, those files are silently missing from the
    // deployed function and Chromium fails to launch.
    outputFileTracingIncludes: {
      'app/api/telegram-angeles/route.ts': ['./node_modules/@sparticuz/chromium/**'],
    },
  },
};
export default nextConfig;
