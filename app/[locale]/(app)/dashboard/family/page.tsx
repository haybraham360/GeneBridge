import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import FamilyMap from '@/components/family/FamilyMap';
import { routing } from '@/i18n/routing';
import { listConditions } from '@/lib/conditions/catalogue';
import { loadFamilyTree } from '@/lib/family/server';
import { currentPerson } from '@/lib/profile/currentPerson';
import { createClient, getAuthUser } from '@/lib/supabase/server';
import { saveFamilyChanges, sendFamilyNotices } from './actions';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/family'>) {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? placeholderMetadata(locale, 'family') : {};
}

// The map is the signed-in person's own data.
export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }: PageProps<'/[locale]/dashboard/family'>) {
  const { locale } = await params;
  const { notify } = await searchParams;
  if (!hasLocale(routing.locales, locale)) notFound();
  const supabase = await createClient();
  const [user, person] = await Promise.all([getAuthUser(supabase), currentPerson(supabase)]);
  if (!user) notFound();

  // The owner's own family map (task 13). Owner-only by row-level security.
  const tree = await loadFamilyTree(supabase, user.id);
  if (!tree) {
    const t = await getTranslations({ locale, namespace: 'family.status' });
    return (
      <p role="alert" className="m-6 rounded-tile bg-brand-tint px-4 py-3 text-sm">
        {t('loadError')}
      </p>
    );
  }
  const catalogue = listConditions(locale).map((c) => ({ id: c.id, title: c.title }));

  // ?notify=1 opens the notify flow directly (from the talk page's relatives guide).
  return (
    <FamilyMap
      initialTree={tree}
      catalogue={catalogue}
      selfName={person.firstName}
      onSave={saveFamilyChanges}
      onNotify={sendFamilyNotices}
      openNotify={notify === '1'}
    />
  );
}
