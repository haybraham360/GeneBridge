import { NextIntlClientProvider } from 'next-intl';

/** Marketing pages: all client messages (the root layout no longer provides them). */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
