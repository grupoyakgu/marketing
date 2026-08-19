const GMAIL_API = 'https://www.googleapis.com/gmail/v1';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

// Warm-instance cache only -- a cold start just re-fetches. Refresh tokens
// don't expire on their own use, so there's no persistence concern here.
let cachedToken: CachedToken | null = null;

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.accessToken;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    console.error(`[Gmail] token refresh failed: ${res.status} ${await res.text()}`);
    return null;
  }
  const json = await res.json();
  cachedToken = { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.accessToken;
}

/** Returns [] (rather than throwing) when Gmail isn't configured yet, so
 * callers can run unconditionally and just do nothing until the
 * GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET/GMAIL_REFRESH_TOKEN env vars exist. */
export async function listMessageIds(query: string, maxResults = 20): Promise<string[]> {
  const token = await getAccessToken();
  if (!token) return [];

  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  const res = await fetch(`${GMAIL_API}/users/me/messages?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`[Gmail] list messages failed: ${res.status} ${await res.text()}`);
    return [];
  }
  const json = await res.json();
  const messages: { id: string }[] = json.messages ?? [];
  return messages.map(m => m.id);
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

function extractPlainText(payload: GmailPart | undefined): string | null {
  if (!payload) return null;
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainText(part);
      if (text) return text;
    }
  }
  // Fallback for a Persuadis-style email sent as HTML only -- crude tag
  // stripping is enough since these bodies are just labeled plain fields,
  // no meaningful markup to preserve.
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return null;
}

export async function getMessagePlainText(id: string): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const res = await fetch(`${GMAIL_API}/users/me/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`[Gmail] get message ${id} failed: ${res.status} ${await res.text()}`);
    return null;
  }
  const json = await res.json();
  return extractPlainText(json.payload);
}

function buildRawMessage(from: string, to: string, subject: string, text: string): string {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`;
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf-8').toString('base64'),
  ].join('\r\n');
  return Buffer.from(message, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sendEmail(
  to: string,
  subject: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getAccessToken();
  const from = process.env.GMAIL_USER_EMAIL;
  if (!token || !from) return { success: false, error: 'Gmail is not configured.' };

  const raw = buildRawMessage(from, to, subject, text);
  const res = await fetch(`${GMAIL_API}/users/me/messages/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error(`[Gmail] send failed: ${res.status} ${errText}`);
    return { success: false, error: `Gmail send failed (${res.status}).` };
  }
  return { success: true };
}
