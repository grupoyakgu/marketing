const GRAPH_API = 'https://graph.facebook.com/v19.0';

// Separate from INSTAGRAM_PAGE_ACCESS_TOKEN (organic posting/reading) since
// ads data needs Meta's Marketing API and the ads_read permission — the user
// may add ads_read to that same token, or keep a dedicated one; either way
// this reads whichever token is configured here.
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

export interface AdAccountTotals {
  currency: string;
  spend: number;
  reach: number;
  impressions: number;
  cpm: number;
}

export async function getMetaAdAccountTotals(datePreset = 'last_30d'): Promise<AdAccountTotals | null> {
  const creds = getCredentials();
  if (!creds) return null;

  const params = new URLSearchParams({
    fields: `currency,insights.date_preset(${datePreset}){spend,reach,impressions,cpm}`,
    access_token: creds.token,
  });
  const res = await fetch(`${GRAPH_API}/${creds.accountId}?${params}`);
  if (!res.ok) {
    console.error(`Meta Ads getAccountTotals failed: ${res.status} ${await res.text()}`);
    return null;
  }
  const json = await res.json();
  const row = json.insights?.data?.[0];
  return {
    currency: json.currency ?? 'USD',
    spend: row ? Number(row.spend ?? 0) : 0,
    reach: row ? Number(row.reach ?? 0) : 0,
    impressions: row ? Number(row.impressions ?? 0) : 0,
    cpm: row ? Number(row.cpm ?? 0) : 0,
  };
}

export interface AdCampaignSummary {
  id: string;
  name: string;
  objective: string;
  status: string;
  spend: number;
  reach: number;
  impressions: number;
  cpm: number;
  engagements: number;
}

/** Boosting a post creates a campaign (objective around post/page engagement)
 * containing one ad set and one ad referencing that post — so recent
 * campaigns here is effectively "your boosted posts and other ad activity." */
export async function getMetaAdCampaigns(datePreset = 'last_30d'): Promise<AdCampaignSummary[]> {
  const creds = getCredentials();
  if (!creds) return [];

  const fields = `name,objective,effective_status,insights.date_preset(${datePreset}){spend,reach,impressions,cpm,actions}`;
  const params = new URLSearchParams({ fields, limit: '25', access_token: creds.token });
  const res = await fetch(`${GRAPH_API}/${creds.accountId}/campaigns?${params}`);
  if (!res.ok) {
    console.error(`Meta Ads getCampaigns failed: ${res.status} ${await res.text()}`);
    return [];
  }

  const json = await res.json();
  const campaigns: Record<string, unknown>[] = json.data ?? [];
  return campaigns.map(c => {
    const insight = (c.insights as { data?: Record<string, unknown>[] } | undefined)?.data?.[0];
    const actions = (insight?.actions as { action_type: string; value: string }[] | undefined) ?? [];
    const engagements = actions
      .filter(a => a.action_type === 'post_engagement' || a.action_type === 'page_engagement')
      .reduce((sum, a) => sum + Number(a.value || 0), 0);
    return {
      id: c.id as string,
      name: c.name as string,
      objective: c.objective as string,
      status: c.effective_status as string,
      spend: insight ? Number(insight.spend ?? 0) : 0,
      reach: insight ? Number(insight.reach ?? 0) : 0,
      impressions: insight ? Number(insight.impressions ?? 0) : 0,
      cpm: insight ? Number(insight.cpm ?? 0) : 0,
      engagements,
    };
  });
}
