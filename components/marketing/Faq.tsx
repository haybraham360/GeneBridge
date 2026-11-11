import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { SectionHeading } from '@/components/ui/SectionHeading';

const questions = ['conditions', 'guest', 'carrier', 'sharing', 'blindMatch', 'marriage', 'ai'] as const;

export function Faq() {
  const t = useTranslations('landing.faq');

  return (
    <section id="faq" className="mx-auto mt-28 max-w-[820px] px-6">
      <SectionHeading title={t('title')} className="reveal mb-8" />
      <div className="flex flex-col gap-3">
        {questions.map((key) => (
          <Card as="details" key={key} className="group reveal transition-colors duration-200 hover:border-brand-ring open:border-brand-ring">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-card px-6 py-5 text-[17px] font-bold">
              <ChevronDown
                aria-hidden="true"
                className="size-5 shrink-0 -rotate-90 text-brand-text transition-transform duration-300 group-open:rotate-0 rtl:rotate-90 rtl:group-open:rotate-0"
              />
              {t(`${key}.q`)}
            </summary>
            <p className="px-6 pb-5 text-[15px] leading-[1.6] text-muted">{t(`${key}.a`)}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
