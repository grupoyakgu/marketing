import puppeteer from 'puppeteer-core';

// Four straight attempts at running Chromium *inside* the Vercel function
// itself (bundled via @sparticuz/chromium, downloaded via
// @sparticuz/chromium-min, across multiple version pairs) all failed with
// the same "error while loading shared libraries: libnss3.so" — Vercel's
// current Node runtime appears to be missing a system library every one of
// those approaches assumes exists, regardless of how the Chromium binary
// itself is packaged or fetched. Browserbase sidesteps the entire problem
// class: the actual browser runs on Browserbase's infrastructure, not
// inside this function at all — puppeteer-core just connects to it over
// the Chrome DevTools Protocol (CDP) instead of launching a local process,
// so there's no local binary to fail to launch in the first place.
const BROWSERBASE_API = 'https://api.browserbase.com/v1';

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

/** Starts a remote browser session on Browserbase and returns its CDP
 * WebSocket URL to connect puppeteer-core to. */
async function createBrowserbaseSession(): Promise<string> {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;
  if (!apiKey || !projectId) {
    throw new Error('BROWSERBASE_API_KEY/BROWSERBASE_PROJECT_ID not configured');
  }

  const res = await fetch(`${BROWSERBASE_API}/sessions`, {
    method: 'POST',
    headers: { 'X-BB-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Browserbase session create failed (${res.status}): ${body}`);
  }
  const session = await res.json();
  return session.connectUrl as string;
}

/** Screenshots a live dashboard page as Angeles's read-only account, so she
 * can judge actual rendered layout/hierarchy/spacing instead of just
 * reading source. Runs on a remote Browserbase session rather than a local
 * browser process — see the comment above BROWSERBASE_API for why. */
export async function screenshotPage(path: string, fullPage: boolean): Promise<Buffer> {
  const baseUrl = getBaseUrl();
  const [sessionCookie, connectUrl] = await Promise.all([
    getSessionCookie(),
    createBrowserbaseSession(),
  ]);
  const targetUrl = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const browser = await puppeteer.connect({ browserWSEndpoint: connectUrl });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
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
