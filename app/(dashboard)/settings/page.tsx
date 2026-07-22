import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CheckCommentsCard } from '@/components/dashboard/CheckCommentsCard';
import { getServerSession } from '@/lib/server-session';
import { isMetaAdsConfigured, getMetaAdAccountTotals, getMetaAdCampaigns } from '@/lib/meta-ads';
import { RefreshCw, Users, ArrowRight, Megaphone } from 'lucide-react';

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export default async function SettingsPage() {
  const session = await getServerSession();
  const isAdmin = session?.role === 'admin';

  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  const env = process.env.VERCEL_ENV ?? 'development';

  const adsConfigured = isMetaAdsConfigured();
  const [adTotals, adCampaigns] = adsConfigured
    ? await Promise.all([getMetaAdAccountTotals(), getMetaAdCampaigns()])
    : [null, []];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Dashboard configuration and build information.
        </p>
      </div>

      <div className="space-y-3">
        <Link href="/settings/data" className="block">
          <Card className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-4 w-4 text-neutral-400" />
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-white">Data Sync</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Refresh follower and engagement data
                </p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-neutral-300" />
          </Card>
        </Link>
        {isAdmin && (
          <Link href="/settings/users" className="block">
            <Card className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-neutral-400" />
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">Users</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Manage who can access this dashboard
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-neutral-300" />
            </Card>
          </Link>
        )}
      </div>

      <CheckCommentsCard />

      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-neutral-400" />
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Ad Spend (Meta Ads, last 30 days)</h2>
        </div>
        {!adsConfigured ? (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Not connected yet — set <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">FACEBOOK_ADS_ACCESS_TOKEN</code> and{' '}
            <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">FACEBOOK_AD_ACCOUNT_ID</code> to see boosted-post and campaign spend here.
          </p>
        ) : !adTotals ? (
          <p className="text-xs text-red-600 dark:text-red-400">
            Couldn&apos;t reach the Meta Ads API — check the token has the ads_read permission and hasn&apos;t expired.
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-neutral-500 dark:text-neutral-400">Spend</dt>
                <dd className="text-lg font-semibold text-neutral-900 dark:text-white">
                  {formatMoney(adTotals.spend, adTotals.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500 dark:text-neutral-400">Reach</dt>
                <dd className="text-lg font-semibold text-neutral-900 dark:text-white">{adTotals.reach.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500 dark:text-neutral-400">Impressions</dt>
                <dd className="text-lg font-semibold text-neutral-900 dark:text-white">{adTotals.impressions.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500 dark:text-neutral-400">CPM</dt>
                <dd className="text-lg font-semibold text-neutral-900 dark:text-white">
                  {formatMoney(adTotals.cpm, adTotals.currency)}
                </dd>
              </div>
            </dl>

            {adCampaigns.length === 0 ? (
              <p className="text-xs text-neutral-400">No campaigns (boosts) in the last 30 days.</p>
            ) : (
              <div className="space-y-2">
                {adCampaigns.map(c => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-xl border border-neutral-200 px-3 py-2 dark:border-neutral-700"
                  >
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-white">{c.name}</p>
                      <p className="text-xs text-neutral-400">{c.objective}</p>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        <div>{formatMoney(c.spend, adTotals.currency)}</div>
                        <div>{c.reach.toLocaleString()} reach</div>
                      </div>
                      <Badge tone={c.status === 'ACTIVE' ? 'positive' : 'neutral'}>{c.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900 dark:text-white">Build</h2>
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-neutral-500 dark:text-neutral-400">Version</dt>
          <dd className="font-mono text-neutral-900 dark:text-white">{sha ? sha.slice(0, 7) : 'dev'}</dd>
          <dt className="text-neutral-500 dark:text-neutral-400">Branch</dt>
          <dd className="text-neutral-900 dark:text-white">{branch ?? '—'}</dd>
          <dt className="text-neutral-500 dark:text-neutral-400">Environment</dt>
          <dd className="capitalize text-neutral-900 dark:text-white">{env}</dd>
        </dl>
      </Card>
    </div>
  );
}
