import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { routing } from '@/i18n/routing';
import { requireAdminPage } from '@/lib/kyc/server';

/**
 * Demo data (task 15, section 1). Admins only: the proxy returns a 404 for
 * anyone else, this checks again, and every demo_admin_* database function
 * checks the role itself.
 */
export default async function DemoDataLayout({ children, params }: LayoutProps<'/[locale]/admin/demo-data'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  await requireAdminPage();
  return <AdminShell>{children}</AdminShell>;
}
