import type { Browser, Cookie, Page } from 'puppeteer-core';
import { supabase } from './supabase';

export type SocialPlatform = 'linkedin' | 'facebook' | 'instagram';

interface LoginConfig {
  loginUrl: string;
  homeUrl: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  // Substring in the URL that means "still on a login/checkpoint page" —
  // used both to detect a saved session going stale and to detect a failed
  // login attempt (credentials rejected, or challenged with a CAPTCHA/2FA/
  // "verify it's you" page a script can't get past).
  loginPathMarker: string;
}

// Selectors below are these platforms' long-stable login page structure as
// of this writing, not verified against a live page — this sandbox's
// network egress can't reach linkedin.com/instagram.com/facebook.com to
// confirm. If a login starts failing at "waiting for the username field",
// this is the first place to check.
const LOGIN_CONFIG: Record<SocialPlatform, LoginConfig> = {
  linkedin: {
    loginUrl: 'https://www.linkedin.com/login',
    homeUrl: 'https://www.linkedin.com/feed/',
    usernameSelector: '#username',
    passwordSelector: '#password',
    submitSelector: 'button[type="submit"]',
    loginPathMarker: '/login',
  },
  instagram: {
    loginUrl: 'https://www.instagram.com/accounts/login/',
    homeUrl: 'https://www.instagram.com/',
    usernameSelector: 'input[name="username"]',
    passwordSelector: 'input[name="password"]',
    submitSelector: 'button[type="submit"]',
    loginPathMarker: '/accounts/login',
  },
  facebook: {
    loginUrl: 'https://www.facebook.com/login',
    homeUrl: 'https://www.facebook.com/',
    usernameSelector: '#email',
    passwordSelector: '#pass',
    submitSelector: 'button[name="login"]',
    loginPathMarker: '/login',
  },
};

// Social platforms keep background XHR connections alive indefinitely —
// networkidle0 never fires on them. networkidle2 (≤2 in-flight requests)
// fires once the main content has settled, which is the right bar for both
// login pages and feed/home pages. 60 s gives LinkedIn's heavier pages
// enough room; Instagram and Facebook are faster but the same limit applies
// uniformly for simplicity.
const NAVIGATION_TIMEOUT = 60_000;
const WAIT_UNTIL = 'networkidle2' as const;

// The username field wait used to be 15 s, which turned out to be too tight
// even after the nav timeout fix above — a remote CDP session can take
// longer than that just to hydrate the login form. 30 s gives it more room
// for that ordinary case. This alone won't help if the field is missing for
// a different reason entirely (see the diagnostics added in
// performLogin below) — a challenge/CAPTCHA/consent page never renders
// `#username` at all no matter how long you wait.
const USERNAME_FIELD_TIMEOUT = 30_000;

function isOnLoginPage(url: string, platform: SocialPlatform): boolean {
  return url.includes(LOGIN_CONFIG[platform].loginPathMarker);
}

async function getSavedCookies(platform: SocialPlatform): Promise<Cookie[] | null> {
  const { data } = await supabase
    .from('social_login_sessions')
    .select('cookies')
    .eq('platform', platform)
    .maybeSingle();
  return (data?.cookies as Cookie[] | undefined) ?? null;
}

async function saveCookies(platform: SocialPlatform, cookies: Cookie[]): Promise<void> {
  await supabase
    .from('social_login_sessions')
    .upsert({ platform, cookies, updated_at: new Date().toISOString() });
}

/** Types credentials into the login form and submits. Throws with a message
 * distinguishing "no credentials configured" from "submitted but still on a
 * login/checkpoint page" (the latter usually means the platform challenged
 * the automated login — CAPTCHA, 2FA, "verify it's you" — which no amount
 * of retrying will get past; that's a real possible outcome, not a bug). */
async function performLogin(page: Page, platform: SocialPlatform): Promise<void> {
  const username = process.env.SOCIAL_LOGIN_USERNAME;
  const password = process.env.SOCIAL_LOGIN_PASSWORD;
  if (!username || !password) {
    throw new Error('SOCIAL_LOGIN_USERNAME/SOCIAL_LOGIN_PASSWORD not configured');
  }

  const config = LOGIN_CONFIG[platform];
  await page.goto(config.loginUrl, { waitUntil: WAIT_UNTIL, timeout: NAVIGATION_TIMEOUT });

  try {
    await page.waitForSelector(config.usernameSelector, { timeout: USERNAME_FIELD_TIMEOUT });
  } catch {
    // The plain "waiting for selector failed" error from Puppeteer says
    // nothing about *what actually loaded* — a slow-to-hydrate real login
    // page and a checkpoint/CAPTCHA/consent page that will never contain
    // this selector look identical from that message alone. Surfacing the
    // URL and title we actually landed on turns "the selector timed out"
    // into an answerable question next time this happens.
    const title = await page.title().catch(() => '(unable to read title)');
    throw new Error(
      `${platform} login page never showed the username field ("${config.usernameSelector}") after ` +
      `${USERNAME_FIELD_TIMEOUT / 1000}s — current URL: ${page.url()}, page title: "${title}". If the ` +
      `URL is still the plain login page, the form is just slow or the selector no longer matches; if ` +
      `it's something else (a checkpoint, CAPTCHA, or consent page), the automated login is being ` +
      `challenged and needs a manual sign-in from a real browser to clear it.`
    );
  }

  await page.type(config.usernameSelector, username, { delay: 50 });
  await page.type(config.passwordSelector, password, { delay: 50 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: WAIT_UNTIL, timeout: NAVIGATION_TIMEOUT }).catch(() => {}),
    page.click(config.submitSelector),
  ]);

  if (isOnLoginPage(page.url(), platform)) {
    throw new Error(
      `${platform} login did not go through — still on a login/checkpoint page after submitting ` +
      `credentials (current URL: ${page.url()}). This usually means the platform challenged the ` +
      `automated login (CAPTCHA, 2FA, "verify it's you") rather than a credentials problem — that may ` +
      `require signing in manually from a real browser once to clear the challenge.`
    );
  }

  await saveCookies(platform, await page.cookies());
}

/** Returns a page authenticated for the given platform. Tries a saved
 * session first (setting its cookies and confirming the platform still
 * accepts it) since reusing one is far less likely to trigger anti-bot
 * detection than an interactive login on every call; only logs in fresh
 * when there's no saved session or it's gone stale. */
export async function getAuthenticatedPage(browser: Browser, platform: SocialPlatform): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const savedCookies = await getSavedCookies(platform);
  if (savedCookies && savedCookies.length > 0) {
    await page.setCookie(...savedCookies);
    await page.goto(LOGIN_CONFIG[platform].homeUrl, { waitUntil: WAIT_UNTIL, timeout: NAVIGATION_TIMEOUT });
    if (!isOnLoginPage(page.url(), platform)) {
      return page;
    }
  }

  await performLogin(page, platform);
  return page;
}
