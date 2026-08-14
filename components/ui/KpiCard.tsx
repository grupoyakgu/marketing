import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { LucideIcon } from 'lucide-react';

export function KpiCard({
  label,
  value,
  icon: Icon,
  deltaPct,
  tooltip,
  href,
  caption,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  deltaPct?: number | null;
  tooltip?: string;
  href?: string;
  caption?: string;
}) {
  const formattedValue = typeof value === 'number' ? value.toLocaleString() : value;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span
          className="text-sm font-medium text-neutral-500 dark:text-neutral-400"
          title={tooltip}
        >
          {label}
        </span>
        <div className="rounded-lg bg-neutral-100 p-1.5 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          {href ? (
            <Link
              href={href}
              className="text-2xl font-semibold tracking-tight text-neutral-900 no-underline dark:text-white"
            >
              {formattedValue}
            </Link>
          ) : (
            <span className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
              {formattedValue}
            </span>
          )}
          {deltaPct !== undefined && deltaPct !== null && (
            <Badge tone={deltaPct >= 0 ? 'positive' : 'negative'}>
              {deltaPct >= 0 ? '+' : ''}
              {deltaPct.toFixed(1)}%
            </Badge>
          )}
        </div>
        {caption && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {caption}
          </p>
        )}
      </div>
    </Card>
  );
}
