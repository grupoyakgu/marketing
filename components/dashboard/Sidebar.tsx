'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, CalendarDays, Users } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Overview', icon: LayoutDashboard },
    { href: '/planner', label: 'Planner', icon: CalendarDays },
    ...(isAdmin ? [{ href: '/settings/users', label: 'Users', icon: Users }] : []),
  ];

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 bg-white px-4 py-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="h-7 w-7 rounded-lg bg-neutral-900 dark:bg-white" />
        <span className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-white">
          Grupo YAKGU
        </span>
      </div>

      <nav className="flex flex-col gap-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition',
                active
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                  : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
