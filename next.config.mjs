/** @type {import('next').NextConfig} */
const nextConfig = {
  // puppeteer-core (and @sparticuz/chromium-min, used by Angeles's
  // browse_page tool) must stay a plain runtime dependency resolved by Node
  // at request time — webpack should not try to bundle/tree-shake it. This
  // is `experimental.serverComponentsExternalPackages` on Next 14.x — it
  // was only renamed to the stable top-level `serverExternalPackages` in
  // Next 15.
  //
  // No outputFileTracingIncludes needed here: the full @sparticuz/chromium
  // package bundles its own Chromium binary + shared libraries inside
  // node_modules and extracts them at runtime, which Next's file tracer has
  // no static reference to detect (forcing the whole package in via
  // outputFileTracingIncludes still weren't enough in practice — the
  // "-min" variant sidesteps the problem instead of working around it by
  // downloading a complete, already-correct build from GitHub releases at
  // cold start, so there's no local binary for the tracer to miss).
  experimental: {
    serverComponentsExternalPackages: ['@sparticuz/chromium-min', 'puppeteer-core'],
  },
};
export default nextConfig;
