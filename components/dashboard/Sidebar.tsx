'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  MessageSquare,
  Megaphone,
  Settings,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { cn } from '@/lib/cn';

const COLLAPSE_KEY = 'sidebar-collapsed';

export function Sidebar({ buildVersion }: { buildVersion: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Read the saved preference after mount (localStorage isn't available during
  // SSR); with no saved preference yet, default to collapsed on narrow
  // viewports so the sidebar doesn't eat most of a mobile screen on first load.
  useEffect(() => {
    const saved = localStorage.getItem(COLLAPSE_KEY);
    if (saved !== null) setCollapsed(saved === '1');
    else if (window.innerWidth < 768) setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  }

  const links = [
    { href: '/', label: 'Overview', icon: LayoutDashboard },
    { href: '/planner', label: 'Planner', icon: CalendarDays },
    { href: '/comments', label: 'Comments', icon: MessageSquare },
    { href: '/ads', label: 'Ads', icon: Megaphone },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-neutral-200 bg-white py-6 transition-[width] duration-150 dark:border-neutral-800 dark:bg-neutral-900',
        collapsed ? 'w-16 px-2' : 'w-60 px-4'
      )}
    >
      <div className={cn('mb-8 flex items-center px-2', collapsed ? 'justify-center' : 'gap-2')}>
        <div className="h-7 w-7 shrink-0 rounded-lg bg-neutral-900 dark:bg-white" />
        {!collapsed && (
          <span className="truncate text-sm font-semibold tracking-tight text-neutral-900 dark:text-white">
            Grupo YAKGU
          </span>
        )}
      </div>

      <nav className="flex flex-col gap-1">
        {links.map(({ href, label, icon: Icon }) => {
          // Settings owns every page nested under /settings that doesn't have
          // its own sidebar entry (Data Sync, Users), so it stays highlighted
          // there too instead of showing no active item at all.
          const active = href === '/settings' ? pathname.startsWith('/settings') : pathname === href;
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition',
                collapsed && 'justify-center px-0',
                active
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                  : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1 pt-4">
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand menu' : 'Collapse menu'}
          className={cn(
            'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-neutral-500 transition hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800',
            collapsed && 'justify-center px-0'
          )}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4 shrink-0" /> : <ChevronsLeft className="h-4 w-4 shrink-0" />}
          {!collapsed && 'Collapse'}
        </button>
        <p
          title={collapsed ? `v${buildVersion}` : undefined}
          className={cn(
            'px-3 text-xs text-neutral-400 dark:text-neutral-600',
            collapsed && 'text-center px-0'
          )}
        >
          {collapsed ? '•' : `v${buildVersion}`}
        </p>
      </div>
    </aside>
  );
}
