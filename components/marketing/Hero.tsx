import { Dna } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';

// Decorative orange pills. Literal class strings so Tailwind can see them.
const pills = [
  'start-[40px] top-0 rotate-[30deg]',
  'start-[110px] top-[20px] -rotate-[20deg]',
  'start-0 top-[60px] rotate-[60deg]',
  'start-[70px] top-[80px] rotate-[10deg]',
  'start-[150px] top-[90px] rotate-[45deg]',
  'start-[20px] top-[140px] -rotate-[35deg]',
  'start-[100px] top-[150px] rotate-[80deg]',
  'start-[170px] top-[170px] -rotate-[10deg]',
  'start-[60px] top-[210px] rotate-[25deg]',
];

function HelixArt() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 160 300"
      fill="none"
      strokeLinecap="round"
      className="pointer-events-none absolute end-4 top-6 hidden h-[280px] w-[150px] min-[900px]:block"
    >
      <path d="M40 10C140 60 140 110 80 150S20 240 120 290" stroke="#141414" strokeWidth="3" />
      <path d="M120 10C20 60 20 110 80 150S140 240 40 290" stroke="#141414" strokeWidth="3" />
      <path
        d="M62 34l40 10M52 58l58 12M62 86l40 8M58 210l44 10M50 236l60 12M60 262l40 8"
        stroke="#FF5A1F"
        strokeWidth="5"
      />
    </svg>
  );
}

export function Hero() {
  const t = useTranslations('landing.hero');

  return (
    <section className="relative mx-auto max-w-page px-6 pt-12 pb-8 text-center">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute start-0 top-10 hidden h-[260px] w-[240px] min-[900px]:block"
      >
        {pills.map((position) => (
          <span key={position} className={`absolute h-[26px] w-[58px] rounded-full bg-brand ${position}`} />
        ))}
      </div>
      <HelixArt />

      <Chip icon={Dna}>{t('chip')}</Chip>
      <h1 className="mx-auto mt-6 max-w-[840px] text-[clamp(40px,5.4vw,68px)] leading-[1.05] font-extrabold tracking-[-0.03em]">
        {t('title')}
      </h1>
      <p className="mx-auto mt-6 max-w-[620px] text-[19px] leading-[1.6] text-muted">{t('subtitle')}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button href="/auth" variant="primary" size="lg">
          {t('primaryCta')}
        </Button>
        <Button href="/counsellor" variant="dark" size="lg">
          {t('secondaryCta')}
        </Button>
      </div>
      <p className="mt-[18px] text-sm text-muted">{t('note')}</p>
    </section>
  );
}
