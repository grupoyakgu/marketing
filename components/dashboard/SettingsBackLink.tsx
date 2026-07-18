import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export function SettingsBackLink() {
  return (
    <Link
      href="/settings"
      className="mb-2 inline-flex items-center gap-1.5 text-sm text-neutral-500 transition hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Settings
    </Link>
  );
}
