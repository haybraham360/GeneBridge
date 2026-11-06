import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ScanFlow, type CatalogueOption } from '@/components/scan/ScanFlow';
import { routing } from '@/i18n/routing';
import { listConditions } from '@/lib/conditions/catalogue';
import { catalogueFacts } from '@/lib/scan/resolve';
import { extractionAvailable } from '@/lib/scan/extract';
import { testExtractorEnabled } from '@/lib/scan/testExtractor';
import { entryPoints, type EntryPoint } from '@/lib/scan/types';
import { createClient, getAuthUser } from '@/lib/supabase/server';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/scan'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'scan.meta' });
  return { title: t('title') };
}

/**
 * Photograph your report, hear it explained (task 12). Opened from
 * onboarding step 6, the results page, the exploring Home tile and Ask
 * GeneBridge. The explanation language and listen mode come from the
 * person's own profile.
 */
export default async function ScanPage({ params, searchParams }: PageProps<'/[locale]/dashboard/scan'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const query = await searchParams;
  const from = typeof query.from === 'string' ? query.from : 'direct';
  const entry: EntryPoint = (entryPoints as readonly string[]).includes(from) ? (from as EntryPoint) : 'direct';

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  const { data: profile } = user
    ? await supabase.from('profiles').select('locale, learning_mode').eq('user_id', user.id).maybeSingle()
    : { data: null };
  const profileLocale = profile?.locale === 'en' || profile?.locale === 'ar' ? profile.locale : locale;
  // Read and listen: the explanation plays aloud by itself.
  const autoListen = profile?.learning_mode === 'listen' || profile?.learning_mode === 'read_listen';

  // Catalogue facts for previewing statuses on the check screen; the server re-checks everything.
  const catalogue: CatalogueOption[] = listConditions(locale).flatMap((c) => {
    const facts = catalogueFacts(c.id);
    return facts ? [{ id: c.id, title: c.title, gene: c.gene, ...facts }] : [];
  });

  return (
    <ScanFlow
      entry={entry}
      initialLanguage={profileLocale}
      autoListen={autoListen}
      ready={extractionAvailable() || testExtractorEnabled()}
      catalogue={catalogue}
    />
  );
}
