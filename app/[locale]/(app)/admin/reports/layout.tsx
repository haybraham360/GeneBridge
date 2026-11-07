import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { routing } from '@/i18n/routing';
import { requireAdminPage } from '@/lib/kyc/server';

/** Message reports (task 15, section 3). Admins only, checked by the proxy, here and in the database. */
export default async function ReportsLayout({ children, params }: LayoutProps<'/[locale]/admin/reports'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  await requireAdminPage();
  return <AdminShell>{children}</AdminShell>;
}
