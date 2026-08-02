import chromium from '@sparticuz/chromium-min';
import puppeteer from 'puppeteer-core';

// @sparticuz/chromium (the full package) bundles its Chromium binary +
// shared libraries inside node_modules, extracted at runtime — but Next's
// file-tracing has no static reference to that extraction to know it needs
// shipping those files, so they were silently missing from the deployed
// function ("error while loading shared libraries: libnss3.so..."), even
// after forcing the whole package in via outputFileTracingIncludes. The
// "-min" variant sidesteps that entirely by downloading a complete,
// self-contained browser build from Sparticuz's GitHub releases at cold
// start instead — but the same libnss3.so error still showed up even after
// that switch, at @sparticuz/chromium-min@131.0.1 + puppeteer-core@23.10.4.
// That combination is much newer than the versions actually confirmed
// working against Vercel's serverless runtime in the wild; pinned back to
// 119.0.2 / 21.5.1, a documented known-good pairing. Version here must
// match the exact @sparticuz/chromium-min version pinned in package.json —
// both intentionally pinned exact (no ^) since this package's Vercel
// compatibility is version-sensitive enough that letting either drift
// independently risks silently breaking this again.
const CHROMIUM_PACK_URL = 'https://github.com/Sparticuz/chromium/releases/download/v119.0.2/chromium-v119.0.2-pack.tar';

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://marketing-grupo-yakgu.vercel.app';
}

/** Logs in as Angeles's dedicated dashboard account and returns the signed
 * session cookie value — every dashboard route requires one (see
 * middleware.ts). A plain fetch is enough for this; no need to script the
 * login form in the browser itself. */
async function getSessionCookie(): Promise<string> {
  const username = process.env.ANGELES_APP_USERNAME;
  const password = process.env.ANGELES_APP_PASSWORD;
  if (!username || !password) {
    throw new Error('ANGELES_APP_USERNAME/ANGELES_APP_PASSWORD not configured');
  }

  const res = await fetch(`${getBaseUrl()}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Login failed (${res.status}): ${body.error ?? 'unknown error'}`);
  }

  const setCookie = res.headers.get('set-cookie');
  const match = setCookie?.match(/session=([^;]+)/);
  if (!match) throw new Error('Login succeeded but no session cookie was returned');
  return match[1];
}

/** Screenshots a live dashboard page as Angeles's read-only account, so she
 * can judge actual rendered layout/hierarchy/spacing instead of just
 * reading source. A stock Puppeteer/Playwright Chromium download is far too
 * large to run in a Vercel serverless function, hence the trimmed build
 * fetched via CHROMIUM_PACK_URL above. */
export async function screenshotPage(path: string, fullPage: boolean): Promise<Buffer> {
  const baseUrl = getBaseUrl();
  const sessionCookie = await getSessionCookie();
  const targetUrl = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1440, height: 900 },
    executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    const { hostname } = new URL(baseUrl);
    await page.setCookie({
      name: 'session',
      value: sessionCookie,
      domain: hostname,
      path: '/',
      httpOnly: true,
      secure: true,
    });
    await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 30_000 });
    const screenshot = await page.screenshot({ type: 'png', fullPage });
    return Buffer.from(screenshot);
  } finally {
    await browser.close();
  }
}
