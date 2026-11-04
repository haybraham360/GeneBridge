import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeading } from '@/components/ui/SectionHeading';

const plans = [
  { key: 'individual', href: '/auth', variant: 'primary' },
  { key: 'clinic', href: '/contact', variant: 'dark' },
] as const;

export function Pricing() {
  const t = useTranslations('landing.pricing');

  return (
    <section id="pricing" className="mx-auto mt-28 max-w-[1000px] px-6 text-center">
      <SectionHeading title={t('title')} className="reveal" />
      <div className="mt-10 grid grid-cols-1 gap-5 text-start md:grid-cols-2">
        {plans.map(({ key, href, variant }) => (
          // Reveal on the wrapper so it doesn't override the card's hover lift.
          <div key={key} className="reveal flex">
            <Card
              as="article"
              className="flex w-full flex-col gap-3.5 p-8 transition-[translate,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(60,30,10,0.10)]"
            >
              <h3 className="text-lg font-extrabold">{t(`${key}.name`)}</h3>
              <p className="text-[40px] leading-tight font-extrabold">
                <bdi>{t(`${key}.price`)}</bdi>
              </p>
              <p className="text-[15px] text-muted">{t(`${key}.body`)}</p>
              <Button href={href} variant={variant} className="mt-auto">
                {t(`${key}.cta`)}
              </Button>
            </Card>
          </div>
        ))}
      </div>
    </section>
  );
}
