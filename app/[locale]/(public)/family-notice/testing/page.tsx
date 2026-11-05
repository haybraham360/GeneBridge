import type { Metadata } from 'next';
import { MapPin, Languages } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { NoticeColumn, PrivacyBox, QuestionsCard } from '@/components/notice/NoticeParts';
import { cardClasses } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { logNoticeEvent, testingServices } from '@/lib/notices/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/family-notice/testing'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'notice.testing' });
  return { title: t('metaTitle') };
}

/**
 * "Find free, confidential testing": screening and counselling services from
 * the same services data as /services, without sign-in. Opening it counts one
 * notice_testing_clicked (aggregate, no identifiers).
 */
export default async function TestingPage({ params }: PageProps<'/[locale]/family-notice/testing'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [t, services] = await Promise.all([
    getTranslations({ locale, namespace: 'notice.testing' }),
    testingServices(),
    logNoticeEvent('notice_testing_clicked'),
  ]);
  const languageName = new Intl.DisplayNames([locale], { type: 'language' });
  const list = new Intl.ListFormat(locale, { type: 'conjunction' });

  return (
    <NoticeColumn>
      <section aria-labelledby="testing-title" className="flex flex-col gap-3 motion-safe:animate-fade-up">
        <h1 id="testing-title" className="text-[clamp(28px,4vw,40px)] leading-[1.15] font-extrabold tracking-[-0.02em]">
          {t('title')}
        </h1>
        <p className="max-w-[680px] text-[17px] leading-[1.6] text-muted md:text-lg">{t('subtitle')}</p>
        <p className="rounded-tile bg-info-tint px-4 py-3 text-base text-info-text md:text-sm">{t('placeholder')}</p>
      </section>

      <section aria-labelledby="services-count" className="flex flex-col gap-4 motion-safe:animate-fade-up motion-safe:[animation-delay:80ms]">
        <p id="services-count" className="text-base text-muted">
          {services.length ? t('count', { count: services.length }) : t('empty')}
        </p>
        <ul data-testid="testing-services" className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
          {services.map((service) => (
            <li key={service.name} className={cn(cardClasses, 'flex flex-col gap-3 p-[22px]')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-[17px] font-extrabold">{service.name}</h2>
                <Chip>{t(`kinds.${service.kind}`)}</Chip>
              </div>
              <p className="text-base leading-[1.55] text-muted md:text-[15px]">{t(`descriptions.${service.kind}`)}</p>
              <p className="flex items-center gap-2 text-base md:text-sm">
                <MapPin aria-hidden="true" className="size-4 flex-none text-brand-text" strokeWidth={2} />
                {service.area ?? t('unavailable')}
              </p>
              <p className="flex items-center gap-2 text-base md:text-sm">
                <Languages aria-hidden="true" className="size-4 flex-none text-brand-text" strokeWidth={2} />
                {t('languages', {
                  list: service.languages.length
                    ? list.format(service.languages.map((code) => languageName.of(code) ?? code))
                    : t('unavailable'),
                })}
              </p>
              <p className="text-base text-muted md:text-sm">{t('howToBook')}</p>
            </li>
          ))}
        </ul>
      </section>

      <QuestionsCard />
      <PrivacyBox code={null} />
    </NoticeColumn>
  );
}
