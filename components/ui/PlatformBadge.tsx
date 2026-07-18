import { cn } from '@/lib/cn';

type Platform = 'linkedin' | 'instagram' | 'facebook';

const PLATFORM_BG: Record<Platform, string> = {
  facebook: 'bg-facebook',
  instagram: 'bg-instagram',
  linkedin: 'bg-linkedin',
};

const PLATFORM_LABEL: Record<Platform, string> = {
  facebook: 'f',
  instagram: 'IG',
  linkedin: 'in',
};

const SIZE: Record<'sm' | 'md', string> = {
  sm: 'h-4 w-4 text-[9px]',
  md: 'h-6 w-6 text-[11px]',
};

export function PlatformBadge({ platform, size = 'sm' }: { platform: Platform; size?: 'sm' | 'md' }) {
  return (
    <span
      title={platform}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none text-white',
        PLATFORM_BG[platform],
        SIZE[size]
      )}
    >
      {PLATFORM_LABEL[platform]}
    </span>
  );
}
