/** @type {import('next').NextConfig} */
const nextConfig = {
  // puppeteer-core must stay a plain runtime dependency resolved by Node at
  // request time — webpack should not try to bundle/tree-shake it. This is
  // `experimental.serverComponentsExternalPackages` on Next 14.x — it was
  // only renamed to the stable top-level `serverExternalPackages` in Next 15.
  //
  // No local Chromium package (or its bundling/tracing concerns) anymore:
  // Angeles's browse_page tool (lib/browser.ts) now connects to a remote
  // Browserbase session over CDP instead of launching a browser inside this
  // function — see the comment in that file for why.
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core'],
    // .claude/skills/*/SKILL.md is never imported by any route's code, so
    // Next's default file tracing (which follows require/import graphs)
    // would otherwise leave it out of the deployed function bundle — Pepe's
    // use_marketing_skill tool (lib/marketing-skills.ts) reads these files
    // from disk at request time, not via import.
    outputFileTracingIncludes: {
      '/api/telegram': ['./.claude/skills/**/*'],
    },
  },
};
export default nextConfig;
