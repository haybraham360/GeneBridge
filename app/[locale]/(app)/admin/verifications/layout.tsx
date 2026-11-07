import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { routing } from '@/i18n/routing';
import { requireAdminPage } from '@/lib/kyc/server';

/**
 * Verification review (task 14, section 6). Admins only: the proxy returns a
 * 404 for anyone else, this checks again, and every kyc_admin_* database
 * function checks the role itself.
 */
export default async function AdminLayout({ children, params }: LayoutProps<'/[locale]/admin/verifications'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  await requireAdminPage();
  return <AdminShell>{children}</AdminShell>;
}
