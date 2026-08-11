import puppeteer, { type Browser, type Page } from 'puppeteer-core';

// Four straight attempts at running Chromium *inside* the Vercel function
// itself (bundled via @sparticuz/chromium, downloaded via
// @sparticuz/chromium-min, across multiple version pairs) all failed with
// the same "error while loading shared libraries: libnss3.so" — Vercel's
// current Node runtime appears to be missing a system library every one of
// those approaches assumes exists, regardless of how the Chromium binary
// itself is packaged or fetched. Browserbase (with Browserless as a fallback
// — see connectRemoteBrowser below) sidesteps the entire problem class: the
// actual browser runs on the provider's infrastructure, not inside this
// function at all — puppeteer-core just connects to it over the Chrome
// DevTools Protocol (CDP) instead of launching a local process, so there's
// no local binary to fail to launch in the first place.
const BROWSERBASE_API = 'https://api.browserbase.com/v1';

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://marketing-grupo-yakgu.vercel.app';
}

// Anthropic's Vision API hard-caps any single image dimension at 8000px,
// but chat_history keeps the last 40 messages, so a browsing session
// routinely has more than one image live in context at once -- and the
// *many-image* request path caps every dimension at 2000px, not 8000.
// 2000 is therefore the real limit that matters here. A full-page
// capture's height is whatever the page's total scroll height happens to
// be -- unbounded -- while width stays fixed at the viewport width set
// below, but both are guarded for safety.
const MAX_IMAGE_DIMENSION = 2000;

/** Scales a full-page screenshot down to fit MAX_IMAGE_DIMENSION instead of
 * cropping it there. An earlier version used `clip` to crop at the cap,
 * which silently threw away everything below the fold -- useless for
 * judging a long landing page's design. `clip.scale` asks Chrome to render
 * the same full-page region at a smaller pixel scale instead, so the
 * output still shows the whole page, just downsized. Confirmed in
 * production: a full-page screenshot taller than the cap got saved to
 * chat_history as part of a normal, correctly-paired tool_result, and only
 * got rejected on the *next* messages.create call -- by which point it was
 * already permanently stuck in storage, poisoning every future turn the
 * same way an orphaned tool_use does (see lib/chat-history.ts's repair
 * pass, which can't help here since this pairing is well-formed; only the
 * image content itself is the problem). Capping at capture time is simpler
 * than validating and repairing it after the fact. */
async function capturePageScreenshot(page: Page, fullPage: boolean): Promise<Buffer> {
  if (!fullPage) {
    return Buffer.from(await page.screenshot({ type: 'png' }));
  }
  const { width, height } = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
  if (scale >= 1) {
    return Buffer.from(await page.screenshot({ type: 'png', fullPage: true }));
  }
  return Buffer.from(await page.screenshot({
    type: 'png',
    clip: { x: 0, y: 0, width, height, scale },
  }));
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

// Browserless's CDP endpoint takes the token directly in the WebSocket URL —
// no separate "create a session" call like Browserbase's, so there's nothing
// to fail before puppeteer.connect() itself. Override BROWSERLESS_WS_URL if
// the account's endpoint differs (e.g. a region-specific or dedicated
// Browserless cluster).
function browserlessConnectUrl(): string {
  const apiKey = process.env.BROWSERLESS_API_KEY;
  if (!apiKey) throw new Error('BROWSERLESS_API_KEY not configured');
  const base = process.env.BROWSERLESS_WS_URL ?? 'wss://chrome.browserless.io';
  return `${base}?token=${apiKey}`;
}

const STEEL_API = 'https://api.steel.dev/v1';

/** Starts a remote browser session on Steel.dev and returns its CDP
 * WebSocket URL — same two-step shape as Browserbase (create a session via
 * REST, then connect puppeteer-core to the URL it returns). NOTE: the
 * `websocketUrl` response field below is Steel's documented CDP-connect
 * field as of this writing but is unverified against a live call — this
 * sandbox's network egress is restricted and can't reach steel.dev to
 * confirm. If Steel changes their response shape, this is the line to fix. */
async function createSteelSession(): Promise<string> {
  const apiKey = process.env.STEEL_API_KEY;
  if (!apiKey) throw new Error('STEEL_API_KEY not configured');

  const res = await fetch(`${STEEL_API}/sessions`, {
    method: 'POST',
    headers: { 'Steel-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Steel session create failed (${res.status}): ${body}`);
  }
  const session = await res.json();
  return session.websocketUrl as string;
}

interface BrowserProvider {
  name: string;
  configured: () => boolean;
  connect: () => Promise<Browser>;
}

// Tried in this order — each entry only runs if its own env vars are set, so
// an unconfigured provider is silently skipped rather than counted as a
// failure. Confirmed live: Browserbase's free plan ran out of browser
// minutes (402 on every session create), which is exactly the scenario this
// exists for — one provider exhausting its quota no longer takes browsing
// down entirely as long as at least one more is configured. Add a provider
// here (session-creator + configured() check) to extend the chain further.
const BROWSER_PROVIDERS: BrowserProvider[] = [
  {
    name: 'Browserbase',
    configured: () => Boolean(process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID),
    connect: async () => puppeteer.connect({ browserWSEndpoint: await createBrowserbaseSession() }),
  },
  {
    name: 'Browserless',
    configured: () => Boolean(process.env.BROWSERLESS_API_KEY),
    connect: async () => puppeteer.connect({ browserWSEndpoint: browserlessConnectUrl() }),
  },
  {
    name: 'Steel',
    configured: () => Boolean(process.env.STEEL_API_KEY),
    connect: async () => puppeteer.connect({ browserWSEndpoint: await createSteelSession() }),
  },
];

/** Connects to a remote browser, trying each configured provider above in
 * order and falling through to the next on any failure (exhausted quota, an
 * outage, misconfiguration). Throws if none are configured, or the last
 * provider's error if every configured one failed. */
async function connectRemoteBrowser(): Promise<Browser> {
  const providers = BROWSER_PROVIDERS.filter(p => p.configured());
  if (providers.length === 0) {
    throw new Error(
      'No remote browser provider configured — set at least one of ' +
      'BROWSERBASE_API_KEY/BROWSERBASE_PROJECT_ID, BROWSERLESS_API_KEY, or STEEL_API_KEY.'
    );
  }

  let lastError: unknown;
  for (const [i, provider] of providers.entries()) {
    try {
      return await provider.connect();
    } catch (err) {
      lastError = err;
      const next = providers[i + 1];
      console.error(`[browser] ${provider.name} failed${next ? `, falling back to ${next.name}` : ''}:`, err);
    }
  }
  throw lastError;
}

/** Screenshots a live dashboard page as Angeles's read-only account, so she
 * can judge actual rendered layout/hierarchy/spacing instead of just
 * reading source. Runs on a remote browser session rather than a local
 * browser process — see the comment above BROWSERBASE_API for why. */
export async function screenshotPage(path: string, fullPage: boolean): Promise<Buffer> {
  const baseUrl = getBaseUrl();
  const [sessionCookie, browser] = await Promise.all([
    getSessionCookie(),
    connectRemoteBrowser(),
  ]);
  const targetUrl = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

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
    return await capturePageScreenshot(page, fullPage);
  } finally {
    await browser.close();
  }
}

function assertBrowsableUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`"${url}" is not a valid URL.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Refusing to browse "${url}" — only http:// and https:// URLs are allowed.`);
  }
  return parsed;
}

/** Screenshots any public URL — competitor products, design references
 * (Dribbble, Behance, live SaaS products), articles, anything reachable on
 * the open web. Unlike screenshotPage, this attaches no session cookie and
 * isn't scoped to this app's own domain. Restricted to http(s) to rule out
 * file://, chrome://, javascript: and similar non-navigational schemes. */
export async function screenshotUrl(url: string, fullPage: boolean): Promise<Buffer> {
  const parsed = assertBrowsableUrl(url);
  const browser = await connectRemoteBrowser();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(parsed.toString(), { waitUntil: 'networkidle0', timeout: 30_000 });
    return await capturePageScreenshot(page, fullPage);
  } finally {
    await browser.close();
  }
}

export interface PageLink {
  href: string;
  text: string;
}

// A plain screenshot's pixels never expose a post's actual permalink — a
// feed shows a caption and a username, not the href behind it — so
// discovering commentable posts (the Interactions feature) needs the real
// anchor hrefs alongside the image. Capped at 200 raw links (before the
// caller's own pattern filtering) as a sanity limit against link-farm pages.
export async function screenshotUrlWithLinks(url: string, fullPage: boolean): Promise<{ screenshot: Buffer; links: PageLink[] }> {
  const parsed = assertBrowsableUrl(url);
  const browser = await connectRemoteBrowser();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(parsed.toString(), { waitUntil: 'networkidle0', timeout: 30_000 });
    const [screenshot, links] = await Promise.all([
      capturePageScreenshot(page, fullPage),
      page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href]'))
          .slice(0, 200)
          .map(a => ({ href: (a as HTMLAnchorElement).href, text: (a.textContent ?? '').trim().slice(0, 200) }))
      ),
    ]);
    return { screenshot, links };
  } finally {
    await browser.close();
  }
}
