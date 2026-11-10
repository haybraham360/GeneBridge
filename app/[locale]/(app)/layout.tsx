import { NextIntlClientProvider } from 'next-intl';
import { clientMessages } from '@/i18n/clientMessages';
import { IdleSignOut } from '@/components/auth/IdleSignOut';

/** Signed-in area. The proxy guards these routes; this adds the idle timer. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider messages={await clientMessages(['analytics', 'assistant', 'common', 'conditions', 'couple', 'dashboard', 'family', 'landing', 'notice', 'onboarding', 'proOnboarding', 'admin', 'results', 'scan', 'services', 'talk', 'booking', 'directory', 'chat', 'nearby'])}>
      {children}
      <IdleSignOut />
    </NextIntlClientProvider>
  );
}
