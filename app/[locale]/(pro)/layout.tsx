import { NextIntlClientProvider } from 'next-intl';

/** Counsellor workspace: all client messages (the root layout no longer provides them). */
export default function ProGroupLayout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
