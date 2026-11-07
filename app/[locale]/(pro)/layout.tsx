import { NextIntlClientProvider } from 'next-intl';
import { clientMessages } from '@/i18n/clientMessages';

/** Counsellor workspace: only the client messages this group uses (see i18n/clientMessages). */
export default async function ProGroupLayout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider messages={await clientMessages(['common', 'landing', 'pro', 'proOnboarding', 'verify', 'scan', 'booking', 'chat'])}>{children}</NextIntlClientProvider>;
}
