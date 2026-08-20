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

/** Finds the post a campaign's ads are actually boosting, by reading each
 * ad's creative -- Meta's Marketing API doesn't surface this on the campaign
 * itself. Every campaign here boosts exactly one post in practice (see the
 * comment on hasActivePaidCampaigns above), so this stops at the first ad
 * whose creative resolves to a link rather than checking every ad. Prefers
 * instagram_permalink_url (a direct, ready-to-use link on the creative
 * itself) and falls back to resolving effective_object_story_id -- the
 * underlying page post's id -- into its real Facebook permalink the same way
 * lib/linkedin-poster.ts resolves a post id into its real web link. */
async function fetchCampaignPostLink(campaignId: string, token: string): Promise<string | null> {
  const params = new URLSearchParams({
    fields: 'creative{instagram_permalink_url,effective_object_story_id}',
    limit: '5',
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
    if (igLink) return igLink;
    const storyId = creative.effective_object_story_id as string | undefined;
    if (storyId) {
      const link = await fetchFacebookPostPermalink(storyId, token);
      if (link) return link;
    }
  }
  return null;
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
      const [windowBreakdown, lifetimeBreakdown, postLink] = await Promise.all([
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
        postLink,
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

  const [adSets, currency, windowBreakdown, lifetimeBreakdown, dailySeries, postLink] = await Promise.all([
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
    postLink,
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
