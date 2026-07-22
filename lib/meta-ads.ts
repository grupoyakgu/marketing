const GRAPH_API = 'https://graph.facebook.com/v19.0';

export type AdPlatform = 'facebook' | 'instagram';

// Separate from INSTAGRAM_PAGE_ACCESS_TOKEN (organic posting/reading) since
// ads data needs Meta's Marketing API and the ads_read permission (and
// ads_management to pause a campaign) — the user may add these to that same
// token, or keep a dedicated one; either way this reads whichever is set here.
function getCredentials(): { token: string; accountId: string } | null {
  const token = process.env.FACEBOOK_ADS_ACCESS_TOKEN;
  const rawAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
  if (!token || !rawAccountId) return null;
  const accountId = rawAccountId.startsWith('act_') ? rawAccountId : `act_${rawAccountId}`;
  return { token, accountId };
}

export function isMetaAdsConfigured(): boolean {
  return getCredentials() !== null;
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
  const res = await fetch(`${GRAPH_API}/${accountId}/campaigns?${params}`);
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
  const res = await fetch(`${GRAPH_API}/${accountId}/adsets?${params}`);
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
  const res = await fetch(`${GRAPH_API}/${accountId}?${params}`);
  if (!res.ok) {
    console.error(`Meta Ads fetchAccountCurrency failed: ${res.status} ${await res.text()}`);
    return 'USD';
  }
  const json = await res.json();
  return json.currency ?? 'USD';
}

export interface PlatformSpend {
  platform: AdPlatform;
  spend: number;
  impressions: number;
  reach: number;
}

async function fetchInsightsBreakdown(
  entityId: string,
  token: string,
  window: { since: string; until: string } | { datePreset: 'maximum' }
): Promise<PlatformSpend[]> {
  const params = new URLSearchParams({
    fields: 'spend,impressions,reach',
    breakdowns: 'publisher_platform',
    limit: '10',
    access_token: token,
  });
  if ('datePreset' in window) params.set('date_preset', window.datePreset);
  else params.set('time_range', JSON.stringify({ since: window.since, until: window.until }));

  const res = await fetch(`${GRAPH_API}/${entityId}/insights?${params}`);
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
    }));
}

function sumBreakdown(rows: PlatformSpend[], field: 'spend' | 'impressions' | 'reach', platform?: AdPlatform): number {
  const relevant = platform ? rows.filter(r => r.platform === platform) : rows;
  return relevant.reduce((sum, r) => sum + r[field], 0);
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
  platformBreakdown: PlatformSpend[];
}

export interface AdsDashboard {
  currency: string;
  campaigns: CampaignSummary[];
}

export async function getAdsDashboard(opts: {
  platform?: AdPlatform;
  since: string;
  until: string;
}): Promise<AdsDashboard | null> {
  const creds = getCredentials();
  if (!creds) return null;

  const [currency, campaigns, adSets] = await Promise.all([
    fetchAccountCurrency(creds.accountId, creds.token),
    listRawCampaigns(creds.accountId, creds.token),
    listRawAdSets(creds.accountId, creds.token),
  ]);

  const summaries = await Promise.all(
    campaigns.map(async c => {
      const [windowBreakdown, lifetimeBreakdown] = await Promise.all([
        fetchInsightsBreakdown(c.id, creds.token, { since: opts.since, until: opts.until }),
        fetchInsightsBreakdown(c.id, creds.token, { datePreset: 'maximum' }),
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
        platformBreakdown: windowBreakdown,
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

  return { currency, campaigns: filtered };
}

export interface DailyStat {
  date: string;
  spend: number;
  impressions: number;
  reach: number;
}

export async function getCampaignDailySeries(
  campaignId: string,
  since: string,
  until: string,
  platform?: AdPlatform
): Promise<DailyStat[]> {
  const creds = getCredentials();
  if (!creds) return [];

  const params = new URLSearchParams({
    fields: 'spend,impressions,reach',
    time_range: JSON.stringify({ since, until }),
    time_increment: '1',
    limit: '500',
    access_token: creds.token,
  });
  if (platform) params.set('breakdowns', 'publisher_platform');

  const res = await fetch(`${GRAPH_API}/${campaignId}/insights?${params}`);
  if (!res.ok) {
    console.error(`Meta Ads dailySeries failed for ${campaignId}: ${res.status} ${await res.text()}`);
    return [];
  }
  const json = await res.json();
  const rows: Record<string, unknown>[] = json.data ?? [];

  const byDate = new Map<string, DailyStat>();
  for (const r of rows) {
    if (platform && r.publisher_platform !== platform) continue;
    const date = r.date_start as string;
    const existing = byDate.get(date) ?? { date, spend: 0, impressions: 0, reach: 0 };
    existing.spend += Number(r.spend ?? 0);
    existing.impressions += Number(r.impressions ?? 0);
    existing.reach += Number(r.reach ?? 0);
    byDate.set(date, existing);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export interface CampaignDetail extends CampaignSummary {
  dailySeries: DailyStat[];
  currency: string;
}

export async function getCampaignDetail(
  campaignId: string,
  opts: { platform?: AdPlatform; since: string; until: string }
): Promise<CampaignDetail | null> {
  const creds = getCredentials();
  if (!creds) return null;

  const params = new URLSearchParams({
    fields: 'id,name,objective,effective_status,daily_budget,lifetime_budget,start_time,stop_time',
    access_token: creds.token,
  });
  const res = await fetch(`${GRAPH_API}/${campaignId}?${params}`);
  if (!res.ok) {
    console.error(`Meta Ads getCampaignDetail failed for ${campaignId}: ${res.status} ${await res.text()}`);
    return null;
  }
  const c = await res.json();
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

  const [adSets, currency, windowBreakdown, lifetimeBreakdown, dailySeries] = await Promise.all([
    listRawAdSets(creds.accountId, creds.token).then(all => all.filter(a => a.campaignId === campaignId)),
    fetchAccountCurrency(creds.accountId, creds.token),
    fetchInsightsBreakdown(campaignId, creds.token, { since: opts.since, until: opts.until }),
    fetchInsightsBreakdown(campaignId, creds.token, { datePreset: 'maximum' }),
    getCampaignDailySeries(campaignId, opts.since, opts.until, opts.platform),
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
    platformBreakdown: windowBreakdown,
    dailySeries,
    currency,
  };
}

export interface PauseResult {
  success: boolean;
  error?: string;
}

/** Pausing requires the ads_management permission on the token — ads_read
 * (everything else in this file) only allows reading. Surfaces that
 * distinction clearly since it's an easy gap to hit after only following the
 * ads_read setup steps. */
export async function pauseCampaign(campaignId: string): Promise<PauseResult> {
  const creds = getCredentials();
  if (!creds) return { success: false, error: 'Meta Ads is not configured.' };

  const res = await fetch(`${GRAPH_API}/${campaignId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ status: 'PAUSED', access_token: creds.token }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Meta Ads pauseCampaign failed for ${campaignId}: ${res.status} ${body}`);
    const permissionIssue = res.status === 403 || body.includes('ads_management') || body.includes('permission');
    return {
      success: false,
      error: permissionIssue
        ? 'Missing permission — pausing a campaign needs the ads_management permission on the token (ads_read alone only allows reading).'
        : `Failed to pause campaign (${res.status}).`,
    };
  }
  return { success: true };
}
