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
  },
};
export default nextConfig;
