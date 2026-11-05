import type { Metadata } from 'next';
import { Info } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ServicesList } from '@/components/services/ServicesList';
import { serviceTypes, type ServiceItem, type ServiceType } from '@/lib/services/types';
import { routing } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/services'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'services.meta' });
  return { title: t('title') };
}

const specialist = new Set(['haematology', 'neuromuscular', 'audiology', 'metabolic']);

type Row = {
  kind: string;
  name: string;
  area: string | null;
  languages: string[] | null;
  description_en: string | null;
  description_ar: string | null;
  coverage: ServiceItem['coverage'] | null;
  women_only: boolean | null;
  phone: string | null;
};

/** Care & services (design Services). `?type=screening` opens one type. */
export default async function ServicesPage({ params, searchParams }: PageProps<'/[locale]/dashboard/services'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { type } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'services' });

  const supabase = await createClient();
  const full = await supabase
    .from('services')
    .select('kind, name, area, languages, description_en, description_ar, coverage, women_only, phone')
    .order('sort');
  // Before the directory migration, fall back to the basic columns.
  const basic = full.error ? await supabase.from('services').select('kind, name, area, languages').order('sort') : null;
  const rows = ((full.error ? basic?.data : full.data) ?? []) as Partial<Row>[];

  const services: ServiceItem[] = rows.map((r) => ({
    name: r.name ?? '',
    type: (specialist.has(r.kind ?? '') ? 'specialist' : r.kind) as ServiceType,
    description: (locale === 'ar' ? r.description_ar : r.description_en) ?? null,
    area: r.area ?? null,
    languages: r.languages ?? [],
    coverage: r.coverage ?? 'details',
    womenOnly: r.women_only ?? false,
    phone: r.phone ?? '[CONFIRM]',
  }));
  const initialType = (serviceTypes as readonly string[]).includes(String(type)) ? (type as ServiceType) : 'all';

  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-auto px-[clamp(16px,3vw,40px)] pt-9 pb-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">{t('title')}</h1>
        <p className="text-[15px] text-muted">{t('subtitle')}</p>
      </header>
      <p className="mt-6 flex items-start gap-3 rounded-card bg-brand-tint-soft px-5 py-4 text-[15px]">
        <Info aria-hidden="true" className="mt-0.5 size-5 flex-none text-brand-text" strokeWidth={2} />
        {t('placeholder')}
      </p>
      <div className="mt-6">
        <ServicesList services={services} initialType={initialType} />
      </div>
    </main>
  );
}
