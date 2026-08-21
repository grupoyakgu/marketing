import { supabase } from './supabase';

const GRAPH_API = 'https://graph.facebook.com/v19.0';

// Every read below passes cache: 'no-store' explicitly — confirmed by
// production logs that a campaign's effective_status kept coming back stale
// (ACTIVE) for 5+ minutes after a successful pause despite this route already
// being export const dynamic = 'force-dynamic'; that alone didn't stop
// Next.js's fetch data cache from serving a cached response for these calls.

export type AdPlatform = 'facebook' | 'instagram';

// FACEBOOK_AD_ACCOUNT_ID accepts a comma-separated list, one per account the
// user wants to switch between in the dashboard (e.g. their Business
// Manager-owned account plus an Instagram-app-created one) — same pattern as
// CLOUDINARY_GALLERY_FOLDERS. The first one is the default when the caller
// doesn't specify which account to use.
function getConfiguredAccountIds(): string[] {
  const raw = process.env.FACEBOOK_AD_ACCOUNT_ID;
  if (!raw) return [];
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(id => (id.startsWith('act_') ? id : `act_${id}`));
}

// Separate from INSTAGRAM_PAGE_ACCESS_TOKEN (organic posting/reading) since
// ads data needs Meta's Marketing API and the ads_read permission (and
// ads_management to pause a campaign) — the user may add these to that same
// token, or keep a dedicated one; either way this reads whichever is set here.
// accountId, if passed, must be one of the configured accounts — never trust
// an arbitrary caller-supplied account id, since the token may have broader
// access than what's meant to be exposed through this dashboard.
function getCredentials(accountId?: string): { token: string; accountId: string } | null {
  const token = process.env.FACEBOOK_ADS_ACCESS_TOKEN;
  const configured = getConfiguredAccountIds();
  if (!token || configured.length === 0) return null;

  if (!accountId) return { token, accountId: configured[0] };
  const normalized = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  if (!configured.includes(normalized)) return null;
  return { token, accountId: normalized };
}

export function isMetaAdsConfigured(): boolean {
  return getCredentials() !== null;
}

/** True if any configured ad account currently has an active campaign — used
 * to widen the comment-check lookback window for organic posts that are also
 * running as paid boosts, since those can keep drawing new comments well
 * past the default recency cutoff. Deliberately coarse (any active campaign
 * on any account, not resolved to a specific post) rather than trying to map
 * a campaign's ad creative back to the exact post it boosts — every paid
 * post here is already a boost of a post we posted ourselves and already
 * track, so widening the window is enough; no need to reconstruct the
 * ad-to-post mapping from Meta's Ads API at all. */
export async function hasActivePaidCampaigns(): Promise<boolean> {
  const token = process.env.FACEBOOK_ADS_ACCESS_TOKEN;
  const accountIds = getConfiguredAccountIds();
  if (!token || accountIds.length === 0) return false;

  const results = await Promise.all(accountIds.map(id => listRawCampaigns(id, token)));
  return results.some(campaigns => campaigns.some(c => c.status === 'ACTIVE'));
}

export interface AdAccountOption {
  id: string;
  name: string;
}

async function getCustomLabels(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('ad_account_labels').select('account_id, label');
  if (error) {
    console.error(`Meta Ads getCustomLabels failed: ${error.message}`);
    return {};
  }
  return Object.fromEntries((data ?? []).map(row => [row.account_id, row.label]));
}

/** A user-set label always wins over Meta's own account name — the latter is
 * often unhelpful (a personal ad account just returns its bare account_id). */
export async function listConfiguredAdAccounts(): Promise<AdAccountOption[]> {
  const token = process.env.FACEBOOK_ADS_ACCESS_TOKEN;
  const accountIds = getConfiguredAccountIds();
  if (!token || accountIds.length === 0) return [];

  const customLabels = await getCustomLabels();

  return Promise.all(
    accountIds.map(async id => {
      if (customLabels[id]) return { id, name: customLabels[id] };
      const params = new URLSearchParams({ fields: 'name', access_token: token });
      const res = await fetch(`${GRAPH_API}/${id}?${params}`, { cache: 'no-store' });
      if (!res.ok) {
        console.error(`Meta Ads listConfiguredAdAccounts failed for ${id}: ${res.status} ${await res.text()}`);
        return { id, name: id.replace('act_', '') };
      }
      const json = await res.json();
      return { id, name: json.name || id.replace('act_', '') };
    })
  );
}

export async function setAdAccountLabel(accountId: string, label: string): Promise<void> {
  const normalized = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  if (!getConfiguredAccountIds().includes(normalized)) throw new Error('Unknown ad account.');
  const trimmed = label.trim();
  if (!trimmed) throw new Error('Label cannot be empty.');

  const { error } = await supabase
    .from('ad_account_labels')
    .upsert({ account_id: normalized, label: trimmed, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

// ─── Low-level fetch helpers ────────────────────────────────────────────────

interface RawEntity {
  id: string;
  name: string;
  objective: string;
  status: string;
  // Meta returns campaign/adset budget fields in the account currency's
  // MINOR unit (e.g. cents) as an integer string — unlike insights fields
  // like `spend`, which are already decimalized major-unit strings. Divide
  // by 100 here so every budget/spend value in this module is consistently
  // in major units.
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  startTime: string | null;
  endTime: string | null;
}

async function listRawCampaigns(accountId: string, token: string): Promise<RawEntity[]> {
  const params = new URLSearchParams({
    fields: 'id,name,objective,effective_status,daily_budget,lifetime_budget,start_time,stop_time',
    limit: '100',
    access_token: token,
  });
  const res = await fetch(`${GRAPH_API}/${accountId}/campaigns?${params}`, { cache: 'no-store' });
  if (!res.ok) {
    console.error(`Meta Ads listCampaigns failed: ${res.status} ${await res.text()}`);
    return [];
  }
  const json = await res.json();
  const rows: Record<string, unknown>[] = json.data ?? [];
  return rows.map(c => ({
    id: c.id as string,
    name: c.name as string,
    objective: (c.objective as string) ?? '',
    status: c.effective_status as string,
    dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
    lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
    startTime: (c.start_time as string) ?? null,
    endTime: (c.stop_time as string) ?? null,
  }));
}

async function listRawAdSets(accountId: string, token: string): Promise<(RawEntity & { campaignId: string })[]> {
  const params = new URLSearchParams({
    fields: 'id,name,campaign_id,effective_status,daily_budget,lifetime_budget,start_time,end_time',
    limit: '200',
    access_token: token,
  });
  const res = await fetch(`${GRAPH_API}/${accountId}/adsets?${params}`, { cache: 'no-store' });
  if (!res.ok) {
    console.error(`Meta Ads listAdSets failed: ${res.status} ${await res.text()}`);
    return [];
  }
  const json = await res.json();
  const rows: Record<string, unknown>[] = json.data ?? [];
  return rows.map(a => ({
    id: a.id as string,
    campaignId: a.campaign_id as string,
    name: a.name as string,
    objective: '',
    status: a.effective_status as string,
    dailyBudget: a.daily_budget ? Number(a.daily_budget) / 100 : null,
    lifetimeBudget: a.lifetime_budget ? Number(a.lifetime_budget) / 100 : null,
    startTime: (a.start_time as string) ?? null,
    endTime: (a.end_time as string) ?? null,
  }));
}

async function fetchAccountCurrency(accountId: string, token: string): Promise<string> {
  const params = new URLSearchParams({ fields: 'currency', access_token: token });
  const res = await fetch(`${GRAPH_API}/${accountId}?${params}`, { cache: 'no-store' });
  if (!res.ok) {
    console.error(`Meta Ads fetchAccountCurrency failed: ${res.status} ${await res.text()}`);
    return 'USD';
  }
  const json = await res.json();
  return json.currency ?? 'USD';
}

// Meta's `actions` array reports engagement as a flat list of
// { action_type, value } pairs with no fixed schema — which action_types
// actually appear depends on the ad's objective, placement, and Meta's own
// evolving taxonomy. The exact action_type strings for Instagram's "profile
// activity" metrics (profile visits, business address taps, follows, external
// link taps) aren't confirmable from here (Meta's docs block automated
// fetches), so those are matched by best-effort substring rather than an
// exact key — anything that doesn't match ANY known pattern below still shows
// up in `other` (raw action_type + value) instead of being silently dropped,
// so nothing is ever hidden even if a guessed pattern is wrong.
export interface ActionTotals {
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  linkClicks: number;
  profileVisits: number;
  follows: number;
  businessAddressTaps: number;
  externalLinkTaps: number;
  other: { actionType: string; value: number }[];
}

export function emptyActionTotals(): ActionTotals {
  return {
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    linkClicks: 0,
    profileVisits: 0,
    follows: 0,
    businessAddressTaps: 0,
    externalLinkTaps: 0,
    other: [],
  };
}

export function addActionTotals(a: ActionTotals, b: ActionTotals): ActionTotals {
  const other = new Map(a.other.map(o => [o.actionType, o.value]));
  for (const o of b.other) other.set(o.actionType, (other.get(o.actionType) ?? 0) + o.value);
  return {
    likes: a.likes + b.likes,
    comments: a.comments + b.comments,
    shares: a.shares + b.shares,
    saves: a.saves + b.saves,
    linkClicks: a.linkClicks + b.linkClicks,
    profileVisits: a.profileVisits + b.profileVisits,
    follows: a.follows + b.follows,
    businessAddressTaps: a.businessAddressTaps + b.businessAddressTaps,
    externalLinkTaps: a.externalLinkTaps + b.externalLinkTaps,
    other: Array.from(other, ([actionType, value]) => ({ actionType, value })),
  };
}

function categorizeActions(actions: { action_type?: string; value?: string }[] | undefined): ActionTotals {
  const totals = emptyActionTotals();
  for (const a of actions ?? []) {
    const type = a.action_type ?? '';
    const value = Number(a.value ?? 0);
    if (type === 'like' || type === 'post_reaction') totals.likes += value;
    else if (type === 'comment') totals.comments += value;
    else if (type === 'post') totals.shares += value;
    else if (type === 'post_save' || type === 'onsite_conversion.post_save') totals.saves += value;
    else if (type === 'link_click') totals.linkClicks += value;
    else if (type.includes('profile_visit')) totals.profileVisits += value;
    else if (type.includes('follow')) totals.follows += value;
    else if (type.includes('address') || type.includes('get_directions')) totals.businessAddressTaps += value;
    else if (type.includes('website_click') || type.includes('bio_link') || type.includes('external')) totals.externalLinkTaps += value;
    else totals.other.push({ actionType: type, value });
  }
  return totals;
}

export interface PlatformSpend {
  platform: AdPlatform;
  spend: number;
  impressions: number;
  reach: number;
  actions: ActionTotals;
}

async function fetchInsightsBreakdown(
  entityId: string,
  token: string,
  window: { since: string; until: string } | { datePreset: 'maximum' }
): Promise<PlatformSpend[]> {
  const params = new URLSearchParams({
    fields: 'spend,impressions,reach,actions',
    breakdowns: 'publisher_platform',
    limit: '10',
    access_token: token,
  });
  if ('datePreset' in window) params.set('date_preset', window.datePreset);
  else params.set('time_range', JSON.stringify({ since: window.since, until: window.until }));

  const res = await fetch(`${GRAPH_API}/${entityId}/insights?${params}`, { cache: 'no-store' });
  if (!res.ok) {
    console.error(`Meta Ads insights failed for ${entityId}: ${res.status} ${await res.text()}`);
    return [];
  }
  const json = await res.json();
  const rows: Record<string, unknown>[] = json.data ?? [];
  return rows
    .filter(r => r.publisher_platform === 'facebook' || r.publisher_platform === 'instagram')
    .map(r => ({
      platform: r.publisher_platform as AdPlatform,
      spend: Number(r.spend ?? 0),
      impressions: Number(r.impressions ?? 0),
      reach: Number(r.reach ?? 0),
      actions: categorizeActions(r.actions as { action_type?: string; value?: string }[] | undefined),
    }));
}

function sumBreakdown(rows: PlatformSpend[], field: 'spend' | 'impressions' | 'reach', platform?: AdPlatform): number {
  const relevant = platform ? rows.filter(r => r.platform === platform) : rows;
  return relevant.reduce((sum, r) => sum + r[field], 0);
}

function sumActions(rows: PlatformSpend[], platform?: AdPlatform): ActionTotals {
  const relevant = platform ? rows.filter(r => r.platform === platform) : rows;
  return relevant.reduce((sum, r) => addActionTotals(sum, r.actions), emptyActionTotals());
}

// A boost/campaign-budget-optimization campaign carries its own budget and
// schedule; otherwise (the common single-ad-set boost case) those live on
// its ad set(s) instead, so fall back to summing/spanning those.
function resolveBudgetAndSchedule(
  campaign: RawEntity,
  adSets: (RawEntity & { campaignId: string })[]
): Pick<RawEntity, 'dailyBudget' | 'lifetimeBudget' | 'startTime' | 'endTime'> {
  if (campaign.dailyBudget !== null || campaign.lifetimeBudget !== null) {
    return {
      dailyBudget: campaign.dailyBudget,
      lifetimeBudget: campaign.lifetimeBudget,
      startTime: campaign.startTime,
      endTime: campaign.endTime,
    };
  }
  const mine = adSets.filter(a => a.campaignId === campaign.id);
  if (mine.length === 0) {
    return { dailyBudget: null, lifetimeBudget: null, startTime: campaign.startTime, endTime: campaign.endTime };
  }
  const dailySum = mine.reduce((sum, a) => sum + (a.dailyBudget ?? 0), 0);
  const lifetimeSum = mine.reduce((sum, a) => sum + (a.lifetimeBudget ?? 0), 0);
  const starts = mine.map(a => a.startTime).filter((s): s is string => !!s).sort();
  const ends = mine.map(a => a.endTime).filter((s): s is string => !!s).sort();
  return {
    dailyBudget: dailySum > 0 ? dailySum : null,
    lifetimeBudget: lifetimeSum > 0 ? lifetimeSum : null,
    startTime: starts[0] ?? campaign.startTime,
    // Only report an end date if every ad set has one — otherwise at least
    // one is open-ended, so the campaign as a whole is still ongoing.
    endTime: ends.length === mine.length && ends.length > 0 ? ends[ends.length - 1] : campaign.endTime,
  };
}

export interface CampaignSummary {
  id: string;
  name: string;
  objective: string;
  status: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  startTime: string | null;
  endTime: string | null;
  lifetimeSpend: number;
  windowSpend: number;
  windowImpressions: number;
  windowReach: number;
  windowActions: ActionTotals;
  platformBreakdown: PlatformSpend[];
  postLink: string | null;
}

async function fetchFacebookPostPermalink(postId: string, token: string): Promise<string | null> {
  const params = new URLSearchParams({ fields: 'permalink_url', access_token: token });
  const res = await fetch(`${GRAPH_API}/${postId}?${params}`, { cache: 'no-store' });
  if (!res.ok) {
    console.error(`Meta Ads fetchFacebookPostPermalink failed for ${postId}: ${res.status} ${await res.text()}`);
    return null;
  }
  const json = await res.json();
  const permalink = json.permalink_url as string | undefined;
  if (!permalink) return null;
  return permalink.startsWith('http') ? permalink : `https://www.facebook.com${permalink}`;
}

// Reading a Page post's content (its `message` field) with a User or System
// User token still 400s with "requires pages_read_engagement" even once
// that token genuinely has the permission and the Page is an assigned asset
// -- confirmed against this exact account after fixing both. Graph API's
// content endpoints want the Page's own derived access token, not the
// token of whatever User/System User administers it. GET /{page-id} with
// fields=access_token exchanges one for the other using the System User
// token's existing Page access -- no separate manual credential needed.
// Cached per page id since every campaign here shares the same one Page.
const pageAccessTokenCache = new Map<string, Promise<string | null>>();

async function fetchPageAccessToken(pageId: string, systemUserToken: string): Promise<string | null> {
  const cached = pageAccessTokenCache.get(pageId);
  if (cached) return cached;
  const promise = (async () => {
    const params = new URLSearchParams({ fields: 'access_token', access_token: systemUserToken });
    const res = await fetch(`${GRAPH_API}/${pageId}?${params}`, { cache: 'no-store' });
    if (!res.ok) {
      console.error(`Meta Ads fetchPageAccessToken failed for ${pageId}: ${res.status} ${await res.text()}`);
      return null;
    }
    const json = await res.json();
    return (json.access_token as string | undefined) ?? null;
  })();
  pageAccessTokenCache.set(pageId, promise);
  return promise;
}

/** A boosted post can be an "unpublished"/dark ad post -- confirmed against
 * a real boost whose creative resolved to a shortcode absent from this
 * account's entire organic /media list (53 posts total, none matching).
 * Dark posts have a real permalink and shortcode but are never part of the
 * public feed, so there's no way to read one back except through the page
 * post object Meta creates for it either way. Deliberately best-effort:
 * returns null on any failure rather than throwing, since a missing
 * caption should only mean no fallback match, not a broken refresh. */
async function fetchObjectStoryMessage(storyId: string, systemUserToken: string): Promise<string | null> {
  const pageId = storyId.split('_')[0];
  const pageToken = pageId ? await fetchPageAccessToken(pageId, systemUserToken) : null;
  const params = new URLSearchParams({ fields: 'message', access_token: pageToken ?? systemUserToken });
  const res = await fetch(`${GRAPH_API}/${storyId}?${params}`, { cache: 'no-store' });
  if (!res.ok) {
    console.error(`Meta Ads fetchObjectStoryMessage failed for ${storyId}: ${res.status} ${await res.text()}`);
    return null;
  }
  const json = await res.json();
  return (json.message as string | undefined) ?? null;
}

interface CampaignPostLink {
  postLink: string;
  caption: string | null;
}

/** Finds the post a campaign's ads are actually boosting, by reading each
 * ad's creative -- Meta's Marketing API doesn't surface this on the campaign
 * itself. Every campaign here boosts exactly one post in practice (see the
 * comment on hasActivePaidCampaigns above), so this stops at the first ad
 * whose creative resolves to a link rather than checking every ad. Prefers
 * instagram_permalink_url (a direct, ready-to-use link on the creative
 * itself) and falls back to resolving effective_object_story_id -- the
 * underlying page post's id -- into its real Facebook permalink the same way
 * lib/linkedin-poster.ts resolves a post id into its real web link. Also
 * pulls that page post's own caption text alongside the link (see
 * fetchObjectStoryMessage) for getPaidStatsByPostUrl's caption fallback
 * match -- unused by callers that only need the link itself. */
async function fetchCampaignPostLink(campaignId: string, token: string): Promise<CampaignPostLink | null> {
  const params = new URLSearchParams({
    fields: 'creative{instagram_permalink_url,effective_object_story_id}',
    limit: '100',
    access_token: token,
  });
  const res = await fetch(`${GRAPH_API}/${campaignId}/ads?${params}`, { cache: 'no-store' });
  if (!res.ok) {
    console.error(`Meta Ads fetchCampaignPostLink failed for ${campaignId}: ${res.status} ${await res.text()}`);
    return null;
  }
  const json = await res.json();
  const ads: Record<string, unknown>[] = json.data ?? [];
  for (const ad of ads) {
    const creative = ad.creative as Record<string, unknown> | undefined;
    if (!creative) continue;
    const igLink = creative.instagram_permalink_url as string | undefined;
    const storyId = creative.effective_object_story_id as string | undefined;
    if (igLink) {
      const caption = storyId ? await fetchObjectStoryMessage(storyId, token) : null;
      return { postLink: igLink, caption };
    }
    if (storyId) {
      const link = await fetchFacebookPostPermalink(storyId, token);
      if (link) {
        const caption = await fetchObjectStoryMessage(storyId, token);
        return { postLink: link, caption };
      }
    }
  }
  return null;
}

// Instagram shortcodes are case-sensitive (they draw from a 64-char
// alphabet including uppercase) and Meta's ad creative returns them under
// /p/ even for a Reel, while marketing_plan.post_url stores that same post
// under /reel/ (see the earlier Instagram permalink fix) -- two posts with
// the identical shortcode but a different path segment, or differing only
// in case, are still the same post.
const IG_SHORTCODE_RE = /instagram\.com\/(?:p|reel|tv)\/([^/?]+)/i;

/** Both this file's ad-creative post links and marketing_plan's own stored
 * post_url need to resolve to the same key to match a paid campaign back to
 * the organic post it boosted -- there's no shared numeric ID between the
 * Marketing API and organic post records. For Instagram, keys on the
 * case-sensitive shortcode alone (ignoring /p/ vs /reel/ vs /tv/) rather
 * than the full URL. Everything else (Facebook, whose post ids aren't
 * case-sensitive) falls back to a lowercased, query-stripped, trailing-
 * slash form. */
export function normalizePostUrl(url: string): string {
  const igMatch = url.match(IG_SHORTCODE_RE);
  if (igMatch) return `instagram:${igMatch[1]}`;

  const withoutQuery = url.trim().split('?')[0];
  const withSlash = withoutQuery.endsWith('/') ? withoutQuery : `${withoutQuery}/`;
  return withSlash.toLowerCase();
}

// Fallback match key for when a boosted post's shortcode genuinely differs
// from the organic post it was boosted from (see fetchObjectStoryMessage) --
// both sides' caption text still originate from the same written copy, so a
// normalized prefix of it survives as a shared key even when no ID does.
// Unicode-aware so accented Spanish text survives; punctuation/emoji varies
// too easily between the two copies (Meta sometimes appends a link or CTA)
// to be part of the key. Returns null below a length floor -- a short or
// near-empty caption isn't a safe/unique-enough key to match on.
export function normalizeCaption(text: string): string | null {
  const stripped = text
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 120);
  return stripped.length >= 20 ? stripped : null;
}

export interface PaidPostStats {
  spend: number;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
  captionKey: string | null;
}

/** All-time paid engagement for every post currently (or ever) boosted by a
 * campaign, keyed by its normalized permalink -- scans every configured ad
 * account's campaigns and resolves each to the post it boosts via
 * fetchCampaignPostLink, then sums lifetime spend/impressions/reach/actions
 * across every campaign that resolved to the same post. Two Graph API calls
 * per campaign, so this is meant for the daily refresh cron
 * (lib/dashboard-refresh.ts) to cache, not for a live page render. */
export async function getPaidStatsByPostUrl(): Promise<Map<string, PaidPostStats>> {
  const token = process.env.FACEBOOK_ADS_ACCESS_TOKEN;
  const accountIds = getConfiguredAccountIds();
  if (!token || accountIds.length === 0) return new Map();

  const allCampaigns = (await Promise.all(accountIds.map(id => listRawCampaigns(id, token)))).flat();

  const perCampaign = await Promise.all(
    allCampaigns.map(async c => {
      const [resolved, lifetimeBreakdown] = await Promise.all([
        fetchCampaignPostLink(c.id, token),
        fetchInsightsBreakdown(c.id, token, { datePreset: 'maximum' }),
      ]);
      console.log(
        `[Paid stats] campaign ${c.id} (${c.name}): postLink=${resolved?.postLink} caption=${resolved?.caption?.slice(0, 60)}`
      );
      if (!resolved) return null;
      const actions = sumActions(lifetimeBreakdown);
      const stats: PaidPostStats = {
        spend: sumBreakdown(lifetimeBreakdown, 'spend'),
        impressions: sumBreakdown(lifetimeBreakdown, 'impressions'),
        reach: sumBreakdown(lifetimeBreakdown, 'reach'),
        likes: actions.likes,
        comments: actions.comments,
        shares: actions.shares,
        captionKey: resolved.caption ? normalizeCaption(resolved.caption) : null,
      };
      return { postUrl: normalizePostUrl(resolved.postLink), stats };
    })
  );

  const map = new Map<string, PaidPostStats>();
  for (const entry of perCampaign) {
    if (!entry) continue;
    const existing = map.get(entry.postUrl);
    map.set(
      entry.postUrl,
      existing
        ? {
            spend: existing.spend + entry.stats.spend,
            likes: existing.likes + entry.stats.likes,
            comments: existing.comments + entry.stats.comments,
            shares: existing.shares + entry.stats.shares,
            impressions: existing.impressions + entry.stats.impressions,
            reach: existing.reach + entry.stats.reach,
            captionKey: existing.captionKey ?? entry.stats.captionKey,
          }
        : entry.stats
    );
  }
  return map;
}

export interface AdsDashboard {
  currency: string;
  campaigns: CampaignSummary[];
  totalActions: ActionTotals;
}

export async function getAdsDashboard(opts: {
  platform?: AdPlatform;
  since: string;
  until: string;
  accountId?: string;
}): Promise<AdsDashboard | null> {
  const creds = getCredentials(opts.accountId);
  if (!creds) return null;

  const [currency, campaigns, adSets] = await Promise.all([
    fetchAccountCurrency(creds.accountId, creds.token),
    listRawCampaigns(creds.accountId, creds.token),
    listRawAdSets(creds.accountId, creds.token),
  ]);

  const summaries = await Promise.all(
    campaigns.map(async c => {
      const [windowBreakdown, lifetimeBreakdown, resolvedPostLink] = await Promise.all([
        fetchInsightsBreakdown(c.id, creds.token, { since: opts.since, until: opts.until }),
        fetchInsightsBreakdown(c.id, creds.token, { datePreset: 'maximum' }),
        fetchCampaignPostLink(c.id, creds.token),
      ]);
      const resolved = resolveBudgetAndSchedule(c, adSets);

      const summary: CampaignSummary = {
        id: c.id,
        name: c.name,
        objective: c.objective,
        status: c.status,
        dailyBudget: resolved.dailyBudget,
        lifetimeBudget: resolved.lifetimeBudget,
        startTime: resolved.startTime,
        endTime: resolved.endTime,
        lifetimeSpend: sumBreakdown(lifetimeBreakdown, 'spend', opts.platform),
        windowSpend: sumBreakdown(windowBreakdown, 'spend', opts.platform),
        windowImpressions: sumBreakdown(windowBreakdown, 'impressions', opts.platform),
        windowReach: sumBreakdown(windowBreakdown, 'reach', opts.platform),
        windowActions: sumActions(windowBreakdown, opts.platform),
        platformBreakdown: windowBreakdown,
        postLink: resolvedPostLink?.postLink ?? null,
      };
      return summary;
    })
  );

  // With a platform filter, hide campaigns that have never had any delivery
  // on that platform at all (rather than just showing $0 for every campaign
  // regardless of relevance).
  const filtered = opts.platform
    ? summaries.filter(s => s.lifetimeSpend > 0 || s.windowSpend > 0)
    : summaries;

  const totalActions = filtered.reduce((sum, c) => addActionTotals(sum, c.windowActions), emptyActionTotals());

  return { currency, campaigns: filtered, totalActions };
}

export interface DailyStat {
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  actions: ActionTotals;
}

async function fetchDailySeries(entityId: string, token: string, since: string, until: string, platform?: AdPlatform): Promise<DailyStat[]> {
  const params = new URLSearchParams({
    fields: 'spend,impressions,reach,actions',
    time_range: JSON.stringify({ since, until }),
    time_increment: '1',
    limit: '500',
    access_token: token,
  });
  if (platform) params.set('breakdowns', 'publisher_platform');

  const res = await fetch(`${GRAPH_API}/${entityId}/insights?${params}`, { cache: 'no-store' });
  if (!res.ok) {
    console.error(`Meta Ads dailySeries failed for ${entityId}: ${res.status} ${await res.text()}`);
    return [];
  }
  const json = await res.json();
  const rows: Record<string, unknown>[] = json.data ?? [];

  const byDate = new Map<string, DailyStat>();
  for (const r of rows) {
    if (platform && r.publisher_platform !== platform) continue;
    const date = r.date_start as string;
    const existing = byDate.get(date) ?? { date, spend: 0, impressions: 0, reach: 0, actions: emptyActionTotals() };
    existing.spend += Number(r.spend ?? 0);
    existing.impressions += Number(r.impressions ?? 0);
    existing.reach += Number(r.reach ?? 0);
    existing.actions = addActionTotals(existing.actions, categorizeActions(r.actions as { action_type?: string; value?: string }[] | undefined));
    byDate.set(date, existing);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getCampaignDailySeries(
  campaignId: string,
  since: string,
  until: string,
  platform?: AdPlatform
): Promise<DailyStat[]> {
  const creds = getCredentials();
  if (!creds) return [];
  return fetchDailySeries(campaignId, creds.token, since, until, platform);
}

/** Account-wide daily series (summed across every campaign automatically by
 * querying the ad account's own insights endpoint) — powers the main
 * range-selectable chart on the ads page, without fetching + summing each
 * campaign's series individually. */
export async function getAccountDailySeries(
  since: string,
  until: string,
  opts: { platform?: AdPlatform; accountId?: string } = {}
): Promise<DailyStat[]> {
  const creds = getCredentials(opts.accountId);
  if (!creds) return [];
  return fetchDailySeries(creds.accountId, creds.token, since, until, opts.platform);
}

export interface CampaignDetail extends CampaignSummary {
  dailySeries: DailyStat[];
  currency: string;
}

export async function getCampaignDetail(
  campaignId: string,
  opts: { platform?: AdPlatform; since: string; until: string; accountId?: string }
): Promise<CampaignDetail | null> {
  const creds = getCredentials(opts.accountId);
  if (!creds) return null;

  const params = new URLSearchParams({
    fields: 'id,name,objective,effective_status,daily_budget,lifetime_budget,start_time,stop_time',
    access_token: creds.token,
  });
  const res = await fetch(`${GRAPH_API}/${campaignId}?${params}`, { cache: 'no-store' });
  if (!res.ok) {
    console.error(`Meta Ads getCampaignDetail failed for ${campaignId}: ${res.status} ${await res.text()}`);
    return null;
  }
  const c = await res.json();
  console.log(`[meta-ads] getCampaignDetail ${campaignId}: raw effective_status=${c.effective_status} name=${c.name}`);
  const campaign: RawEntity = {
    id: c.id,
    name: c.name,
    objective: c.objective ?? '',
    status: c.effective_status,
    dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
    lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
    startTime: c.start_time ?? null,
    endTime: c.stop_time ?? null,
  };

  const [adSets, currency, windowBreakdown, lifetimeBreakdown, dailySeries, resolvedPostLink] = await Promise.all([
    listRawAdSets(creds.accountId, creds.token).then(all => all.filter(a => a.campaignId === campaignId)),
    fetchAccountCurrency(creds.accountId, creds.token),
    fetchInsightsBreakdown(campaignId, creds.token, { since: opts.since, until: opts.until }),
    fetchInsightsBreakdown(campaignId, creds.token, { datePreset: 'maximum' }),
    getCampaignDailySeries(campaignId, opts.since, opts.until, opts.platform),
    fetchCampaignPostLink(campaignId, creds.token),
  ]);

  const resolved = resolveBudgetAndSchedule(campaign, adSets.map(a => ({ ...a, campaignId })));

  return {
    id: campaign.id,
    name: campaign.name,
    objective: campaign.objective,
    status: campaign.status,
    dailyBudget: resolved.dailyBudget,
    lifetimeBudget: resolved.lifetimeBudget,
    startTime: resolved.startTime,
    endTime: resolved.endTime,
    lifetimeSpend: sumBreakdown(lifetimeBreakdown, 'spend', opts.platform),
    windowSpend: sumBreakdown(windowBreakdown, 'spend', opts.platform),
    windowImpressions: sumBreakdown(windowBreakdown, 'impressions', opts.platform),
    windowReach: sumBreakdown(windowBreakdown, 'reach', opts.platform),
    windowActions: sumActions(windowBreakdown, opts.platform),
    platformBreakdown: windowBreakdown,
    postLink: resolvedPostLink?.postLink ?? null,
    dailySeries,
    currency,
  };
}

export interface PauseResult {
  success: boolean;
  error?: string;
}

/** Pausing/resuming requires the ads_management permission on the token —
 * ads_read (everything else in this file) only allows reading. Surfaces that
 * distinction clearly since it's an easy gap to hit after only following the
 * ads_read setup steps. */
async function setCampaignStatus(campaignId: string, status: 'ACTIVE' | 'PAUSED'): Promise<PauseResult> {
  const creds = getCredentials();
  if (!creds) return { success: false, error: 'Meta Ads is not configured.' };

  const res = await fetch(`${GRAPH_API}/${campaignId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ status, access_token: creds.token }),
  });
  const bodyText = await res.text();
  console.log(`[meta-ads] setCampaignStatus(${status}) for ${campaignId} on account ${creds.accountId}: ${res.status} ${bodyText}`);
  if (!res.ok) {
    const permissionIssue = res.status === 403 || bodyText.includes('ads_management') || bodyText.includes('permission');
    return {
      success: false,
      error: permissionIssue
        ? 'Missing permission — changing a campaign\'s status needs the ads_management permission on the token (ads_read alone only allows reading).'
        : `Failed to ${status === 'PAUSED' ? 'pause' : 'resume'} campaign (${res.status}).`,
    };
  }
  return { success: true };
}

export async function pauseCampaign(campaignId: string): Promise<PauseResult> {
  return setCampaignStatus(campaignId, 'PAUSED');
}

export async function resumeCampaign(campaignId: string): Promise<PauseResult> {
  return setCampaignStatus(campaignId, 'ACTIVE');
}
