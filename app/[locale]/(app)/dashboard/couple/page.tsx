import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { SharedCouple } from '@/components/couple/SharedCouple';
import { buttonClasses } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { loadCoupleView } from '@/lib/couple/view';
import { currentPerson } from '@/lib/profile/currentPerson';
import { createClient } from '@/lib/supabase/server';
import { loadUserPath } from '@/lib/user/path';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/couple'>) {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? placeholderMetadata(locale, 'couple') : {};
}

function Notice({ title, body, cta, href, testId }: { title: string; body: string; cta: string; href: string; testId: string }) {
  return (
    <main className="min-w-0 flex-1 px-[clamp(16px,3vw,40px)] pt-9 pb-10">
      <section data-testid={testId} className="flex max-w-2xl flex-col gap-3 rounded-card border border-line bg-surface p-6 shadow-card">
        <h1 className="text-2xl font-extrabold tracking-[-0.01em]">{title}</h1>
        <p className="text-[15px] leading-[1.6] text-muted">{body}</p>
        <Link href={href} className={buttonClasses('dark', 'md', 'self-start')}>
          {cta}
        </Link>
      </section>
    </main>
  );
}

/**
 * Couple view (task 10, design Couple). Opens only when both partners
 * agreed, and shows only conditions they both carry.
 */
export default async function Page({ params }: PageProps<'/[locale]/dashboard/couple'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const supabase = await createClient();
  const path = await loadUserPath(supabase);
  // Exploring path (task 11): nothing to compare until they add a result.
  if (path.path === 'exploring') {
    const te = await getTranslations({ locale, namespace: 'dashboard.explore.couple' });
    return <Notice testId="couple-needs-result" title={te('title')} body={te('body')} cta={te('cta')} href="/dashboard?addResult=1" />;
  }

  const [view, person, t] = await Promise.all([
    loadCoupleView(supabase),
    currentPerson(supabase),
    getTranslations({ locale, namespace: 'couple.states' }),
  ]);
  if (view.state === 'ready') return <SharedCouple view={view} locale={locale} myName={person.firstName} />;

  const href = {
    no_partner: '/dashboard/couple/consent',
    consent_missing: '/dashboard/couple/consent',
    result_missing: '/dashboard?addResult=1',
    flagged: '/dashboard/counsellor?topic=family',
  }[view.state];
  return (
    <Notice testId={`couple-${view.state}`} title={t(`${view.state}.title`)} body={t(`${view.state}.body`)} cta={t(`${view.state}.cta`)} href={href} />
  );
}
