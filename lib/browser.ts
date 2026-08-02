import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

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
 * reading source. @sparticuz/chromium is a Chromium build specifically
 * trimmed to fit Vercel/Lambda's serverless size and memory constraints —
 * a stock Puppeteer/Playwright download is far too large to bundle here. */
export async function screenshotPage(path: string, fullPage: boolean): Promise<Buffer> {
  const baseUrl = getBaseUrl();
  const sessionCookie = await getSessionCookie();
  const targetUrl = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1440, height: 900 },
    executablePath: await chromium.executablePath(),
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
