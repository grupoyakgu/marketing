import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { CheckCommentsCard } from '@/components/dashboard/CheckCommentsCard';
import { getServerSession } from '@/lib/server-session';
import { RefreshCw, Users, ArrowRight } from 'lucide-react';

export default async function SettingsPage() {
  const session = await getServerSession();
  const isAdmin = session?.role === 'admin';

  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  const env = process.env.VERCEL_ENV ?? 'development';

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
