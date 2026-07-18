import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { LucideIcon } from 'lucide-react';

export function KpiCard({
  label,
  value,
  icon: Icon,
  deltaPct,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  deltaPct?: number | null;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{label}</span>
        <div className="rounded-lg bg-neutral-100 p-1.5 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {deltaPct !== undefined && deltaPct !== null && (
          <Badge tone={deltaPct >= 0 ? 'positive' : 'negative'}>
            {deltaPct >= 0 ? '+' : ''}
            {deltaPct.toFixed(1)}%
          </Badge>
        )}
      </div>
    </Card>
  );
}
