import { cn } from '@/lib/cn';

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900',
        className
      )}
    >
      {children}
    </div>
  );
}
