import {
  ArrowRight,
  CalendarDays,
  ChartColumn,
  Layers,
  Network,
  Shield,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';

type FeatureKey = 'results' | 'couple' | 'simulator' | 'family' | 'counsellor' | 'privacy';

const features: ReadonlyArray<{ key: FeatureKey; href: string; icon: LucideIcon }> = [
  { key: 'results', href: '/results', icon: ChartColumn },
  { key: 'couple', href: '/couple', icon: Users },
  { key: 'simulator', href: '/simulator', icon: Layers },
  { key: 'family', href: '/family', icon: Network },
  { key: 'counsellor', href: '/counsellor', icon: CalendarDays },
  { key: 'privacy', href: '/privacy', icon: Shield },
];

export function Features() {
  const t = useTranslations('landing.features');

  return (
    <section id="features" className="mx-auto mt-28 max-w-[1200px] px-6 text-center">
      <SectionHeading
        chip={t('chip')}
        chipIcon={Layers}
        title={t('title')}
        titleClassName="max-w-[820px] text-[clamp(32px,4vw,48px)] tracking-[-0.025em]"
      />
      <ul className="mt-12 grid grid-cols-1 gap-5 text-start md:grid-cols-2 lg:grid-cols-3">
        {features.map(({ key, href, icon: Icon }) => (
          <li key={key} className="flex">
            <Link
              href={href}
              className={cn(
                cardClasses,
                'flex w-full flex-col gap-3 p-7 text-ink no-underline transition-colors hover:border-brand-ring',
              )}
            >
              <Icon aria-hidden="true" className="size-[30px] text-[#E2531B]" strokeWidth={2} />
              <h3 className="mt-2 text-[19px] font-extrabold">{t(`${key}.title`)}</h3>
              <p className="text-[15px] leading-[1.55] text-muted">{t(`${key}.body`)}</p>
            </Link>
          </li>
        ))}
      </ul>
      <Button href="/auth" variant="primary" className="mt-10">
        {t('cta')}
        <ArrowRight aria-hidden="true" className="size-5 rtl:-scale-x-100" />
      </Button>
    </section>
  );
}
