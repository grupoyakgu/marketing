'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export function UserMenu({ username, role }: { username: string; role: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <p className="text-sm font-medium text-neutral-900 dark:text-white">{username}</p>
        <p className="text-xs capitalize text-neutral-400">{role}</p>
      </div>
      <button
        onClick={handleLogout}
        aria-label="Log out"
        className="rounded-lg p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
