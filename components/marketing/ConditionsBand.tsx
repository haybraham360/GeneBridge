import { ArrowRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { buttonClasses } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Link } from '@/i18n/navigation';
import { listConditions } from '@/lib/conditions/catalogue';

/**
 * "One place for any inherited condition" (design Main). The chips are the
 * condition catalogue itself (content/library), never a hard-coded list.
 */
export function ConditionsBand() {
  const t = useTranslations('landing.conditions');
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const conditions = listConditions(locale);

  return (
    <section className="reveal mx-auto mt-[72px] flex max-w-[1200px] flex-col items-center gap-5 px-6 text-center">
      <SectionHeading title={t('title')} />
      <p className="max-w-[680px] text-base leading-[1.6] text-muted">{t('body')}</p>
      <ul aria-label={t('listLabel')} className="flex max-w-[960px] flex-wrap justify-center gap-2.5">
        {conditions.map((c) => (
          <li key={c.id} className="rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold">
            {c.title}
          </li>
        ))}
        <li className="rounded-full bg-ink px-3.5 py-2 text-[13px] font-semibold text-white">{t('more')}</li>
      </ul>
      <Link href="/dashboard/conditions" className={buttonClasses('ghost', 'md')}>
        {t('cta')}
        <ArrowRight aria-hidden="true" className="size-4 rtl:-scale-x-100" strokeWidth={2} />
      </Link>
    </section>
  );
}
