import { ArrowRight, CalendarDays, Dna, Users, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SectionHeading } from '@/components/ui/SectionHeading';

const steps: ReadonlyArray<{ key: 'add' | 'understand' | 'support'; icon: LucideIcon; number: string }> = [
  { key: 'add', icon: Dna, number: '01' },
  { key: 'understand', icon: Users, number: '02' },
  { key: 'support', icon: CalendarDays, number: '03' },
];

export function HowItWorks() {
  const t = useTranslations('landing.how');

  return (
    <section id="how" className="mx-auto mt-24 max-w-[1200px] px-6 text-center">
      <SectionHeading chip={t('chip')} chipIcon={ArrowRight} className="reveal" />
      <div className="relative mt-12">
      {/* Dashed line joining the steps; draws itself as the section scrolls in. */}
      <span
        aria-hidden="true"
        className="draw-on-scroll absolute inset-x-[16.67%] top-[34px] hidden border-t-2 border-dashed border-brand-ring md:block"
      />
      <ol className="relative grid grid-cols-1 gap-10 md:grid-cols-3">
        {steps.map(({ key, icon: Icon, number }) => (
          <li key={key} className="group reveal flex flex-col items-center gap-3.5 px-3 text-center">
            <div className="relative flex size-[68px] items-center justify-center rounded-full border border-line bg-surface transition-[border-color,scale] duration-300 group-hover:scale-105 group-hover:border-brand-ring">
              <Icon aria-hidden="true" className="size-7 text-ink" strokeWidth={2} />
              <span
                aria-hidden="true"
                className="absolute -end-3 -top-2 flex size-[30px] items-center justify-center rounded-full bg-brand text-xs font-extrabold text-ink"
              >
                {number}
              </span>
            </div>
            <h3 className="mt-1.5 text-[22px] font-extrabold">{t(`${key}.title`)}</h3>
            <p className="max-w-[320px] text-base leading-[1.55] text-muted">{t(`${key}.body`)}</p>
          </li>
        ))}
      </ol>
      </div>
    </section>
  );
}
