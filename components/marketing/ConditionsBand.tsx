import { ArrowRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Link } from '@/i18n/navigation';
import { listConditions, type CatalogueCondition } from '@/lib/conditions/catalogue';
import { cn } from '@/lib/cn';

const chip = 'shrink-0 rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap';

/**
 * One row of the marquee. The list is rendered twice and moved by half its
 * width, so the loop is seamless; the copy is hidden from screen readers.
 * With reduced motion the row wraps and the copy is hidden.
 */
function Row({ items, label, duration, reverse }: { items: CatalogueCondition[]; label?: string; duration: number; reverse?: boolean }) {
  return (
    <div className="flex overflow-hidden motion-reduce:justify-center">
      <div
        className={cn('marquee flex w-max gap-2.5 motion-reduce:w-auto motion-reduce:flex-wrap motion-reduce:justify-center', reverse && '[animation-direction:reverse]')}
        style={{ '--marquee-dur': `${duration}s` } as CSSProperties}
      >
        {[0, 1].map((copy) => (
          <ul
            key={copy}
            aria-label={copy === 0 ? label : undefined}
            aria-hidden={copy === 1 ? true : undefined}
            className={cn('flex gap-2.5 pe-2.5 motion-reduce:flex-wrap motion-reduce:justify-center', copy === 1 && 'motion-reduce:hidden')}
          >
            {items.map((c) => (
              <li key={c.id} className={chip}>
                {c.title}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

/**
 * "One place for any inherited condition" (design Main). The chips are the
 * condition catalogue itself (content/library), never a hard-coded list,
 * drifting slowly in two rows.
 */
export function ConditionsBand() {
  const t = useTranslations('landing.conditions');
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const all = listConditions(locale);
  const half = Math.ceil(all.length / 2);

  return (
    <section className="reveal mx-auto mt-[72px] flex max-w-[1200px] flex-col items-center gap-5 px-6 text-center">
      <SectionHeading title={t('title')} />
      <p className="max-w-[680px] text-base leading-[1.6] text-muted">{t('body')}</p>
      {/* Edges fade out so chips glide in and out of view. */}
      <div className="flex w-full max-w-[1040px] flex-col gap-2.5 mask-x-from-85% mask-x-to-100% motion-reduce:mask-none">
        <Row items={all.slice(0, half)} label={t('listLabel')} duration={70} />
        <Row items={all.slice(half)} duration={80} reverse />
      </div>
      <Link href="/dashboard/conditions" className={buttonClasses('ghost', 'md')}>
        {t('cta')}
        <ArrowRight aria-hidden="true" className="size-4 rtl:-scale-x-100" strokeWidth={2} />
      </Link>
    </section>
  );
}
