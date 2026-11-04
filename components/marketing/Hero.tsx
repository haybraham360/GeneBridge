import { Dna } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { HeroArt } from './HeroArt';

// Staggered entrance for the hero content.
const enter = 'motion-safe:animate-fade-up';

export function Hero() {
  const t = useTranslations('landing.hero');

  return (
    <section className="relative isolate mx-auto max-w-page px-6 pt-12 pb-8 text-center">
      <HeroArt />

      <Chip icon={Dna} className={enter}>
        {t('chip')}
      </Chip>
      <h1 className="mx-auto mt-6 motion-safe:animate-fade-up motion-safe:[animation-delay:80ms] max-w-210 text-[clamp(40px,5.4vw,68px)] leading-[1.05] font-extrabold tracking-[-0.03em]">
        {t('title')}
      </h1>
      <p className="mx-auto mt-6 max-w-155 text-[19px] leading-[1.6] text-muted motion-safe:animate-fade-up motion-safe:[animation-delay:180ms]">{t('subtitle')}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3 motion-safe:animate-fade-up motion-safe:[animation-delay:280ms]">
        <Button href="/auth" variant="primary" size="lg">
          {t('primaryCta')}
        </Button>
        <Button href="/counsellor" variant="dark" size="lg">
          {t('secondaryCta')}
        </Button>
      </div>
      <p className="mt-4.5 text-sm text-muted motion-safe:animate-fade-up motion-safe:[animation-delay:360ms]">{t('note')}</p>
    </section>
  );
}
