import { redirect } from 'next/navigation';
import { DEFAULT_LOCALE } from './[locale]/copy';

export default function InvestRedirect() {
  redirect(`/invest/${DEFAULT_LOCALE}`);
}
