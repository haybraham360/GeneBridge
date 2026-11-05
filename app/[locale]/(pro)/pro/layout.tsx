import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { IdleSignOut } from '@/components/auth/IdleSignOut';
import { routing } from '@/i18n/routing';
import { requireCounsellorPage } from '@/lib/pro/server';
import { ProSidebar } from './components/ProSidebar';

/**
 * Counsellor workspace shell (task 07): its own side menu, stacked above the
 * content on phones. Counsellors only; everyone else gets a 404 (the proxy
 * checks first, this checks again, and every database function checks too).
 */
export default async function ProLayout({ children, params }: LayoutProps<'/[locale]/pro'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { me } = await requireCounsellorPage();

  return (
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      <ProSidebar me={me} />
      <main
        id="main"
        className="flex min-w-0 flex-1 flex-col gap-6 px-[clamp(16px,3vw,40px)] pt-8 pb-12"
      >
        {children}
      </main>
      <IdleSignOut />
    </div>
  );
}
