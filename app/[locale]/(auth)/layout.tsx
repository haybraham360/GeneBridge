import { NextIntlClientProvider } from 'next-intl';

/** Sign-in pages: all client messages (the root layout no longer provides them). */
export default function AuthGroupLayout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
