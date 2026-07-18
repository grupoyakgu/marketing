'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function formatRange(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00Z');
  const end = new Date(addDays(weekStart, 6) + 'T00:00:00Z');
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function currentWeekMonday(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff);
  return monday.toISOString().split('T')[0];
}

export function WeekNav({ weekStart, onChange }: { weekStart: string; onChange: (weekStart: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" onClick={() => onChange(addDays(weekStart, -7))} aria-label="Previous week">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[140px] text-center text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {formatRange(weekStart)}
      </span>
      <Button variant="secondary" onClick={() => onChange(addDays(weekStart, 7))} aria-label="Next week">
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant="ghost" onClick={() => onChange(currentWeekMonday())}>
        Today
      </Button>
    </div>
  );
}
