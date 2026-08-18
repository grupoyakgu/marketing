import { cn } from '@/lib/cn';

// Recreates the YAKGU wordmark as styled text rather than a raster/vector
// asset — it's pure bold uppercase typography with no mark/symbol, so text
// renders crisper at any size, adapts automatically to light/dark mode via
// the existing neutral-900/white convention used elsewhere in this app, and
// needs no image file shipped in the repo.
export function Logo({
  size = 'md',
  variant = 'wordmark',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  /** 'mark' is just the "Y" initial, for tight spaces (e.g. a collapsed sidebar). */
  variant?: 'wordmark' | 'mark';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'font-black uppercase tracking-tight text-neutral-900 dark:text-white',
        size === 'sm' && 'text-base',
        size === 'md' && 'text-xl',
        size === 'lg' && 'text-3xl',
        className
      )}
    >
      {variant === 'mark' ? 'Y' : 'YAKGU'}
    </span>
  );
}
