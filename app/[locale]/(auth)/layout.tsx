import { NextIntlClientProvider } from 'next-intl';
import { clientMessages } from '@/i18n/clientMessages';

/** Sign-in pages: only the client messages this group uses (see i18n/clientMessages). */
export default async function AuthGroupLayout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider messages={await clientMessages(['auth', 'common', 'landing'])}>{children}</NextIntlClientProvider>;
}
