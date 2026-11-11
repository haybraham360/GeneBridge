import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { HeroArt } from './HeroArt';

// Staggered entrance for the hero content.
const enter = 'motion-safe:animate-fade-up';

export function Hero() {
  const t = useTranslations('landing.hero');

  return (
    <section className="relative isolate mx-auto max-w-page px-6 pt-12 pb-8 text-center">
      <HeroArt />

      {/* What's new: jumps to the tools showcase. */}
      <a
        href="#tools"
        className={`${enter} group inline-flex min-h-11 items-center gap-2.5 rounded-full border border-line bg-surface py-1.5 ps-1.5 pe-4 text-[13px] font-semibold text-ink no-underline shadow-card transition-[border-color,translate] duration-300 hover:-translate-y-0.5 hover:border-brand-ring`}
      >
        <span className="rounded-full bg-brand px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-ink uppercase">{t('new')}</span>
        {t('newText')}
        <ArrowRight
          aria-hidden="true"
          className="size-4 text-brand-text transition-transform duration-300 group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1"
          strokeWidth={2.2}
        />
      </a>
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
