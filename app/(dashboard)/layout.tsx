import { getServerSession } from '@/lib/server-session';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { ThemeToggle } from '@/components/dashboard/ThemeToggle';
import { UserMenu } from '@/components/dashboard/UserMenu';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // middleware.ts guarantees a session exists for every route under this layout.
  const session = await getServerSession();
  const isAdmin = session?.role === 'admin';
  // Vercel sets this automatically at build time; no config needed. Falls back
  // to "dev" for local/non-Vercel builds.
  const buildVersion = (process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev').slice(0, 7);

  return (
    <div className="flex min-h-screen">
      <Sidebar isAdmin={isAdmin} buildVersion={buildVersion} />
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-end gap-3 border-b border-neutral-200 bg-white px-6 dark:border-neutral-800 dark:bg-neutral-900">
          <ThemeToggle />
          {session && <UserMenu username={session.username} role={session.role} />}
        </header>
        <main className="flex-1 bg-neutral-50 p-6 dark:bg-neutral-950">{children}</main>
      </div>
    </div>
  );
}
