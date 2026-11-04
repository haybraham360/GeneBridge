import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { PunnettPreview } from './PunnettPreview';

const cardBase = 'flex flex-col gap-3.5 p-6';
const cardTitle = 'text-[17px] font-extrabold';
// Tilted cards straighten and lift when hovered or when something inside has focus.
const cardMotion =
  'transition-[rotate,translate,box-shadow] duration-300 ease-out hover:rotate-0 hover:-translate-y-1.5 hover:shadow-[0_16px_40px_rgba(60,30,10,0.12)] focus-within:rotate-0 focus-within:-translate-y-1.5';
// Cards rise in one after another, just after the hero.
const entrance = [
  'motion-safe:animate-fade-up motion-safe:[animation-delay:420ms]',
  'motion-safe:animate-fade-up motion-safe:[animation-delay:500ms]',
  'motion-safe:animate-fade-up motion-safe:[animation-delay:580ms]',
  'motion-safe:animate-fade-up motion-safe:[animation-delay:660ms]',
];

function ProfileCard() {
  const t = useTranslations('landing.preview.profile');
  const rows = [
    ['conditionLabel', 'condition'],
    ['inheritanceLabel', 'inheritance'],
    ['healthLabel', 'health'],
  ] as const;

  return (
    <Card as="article" className={cn(cardBase, cardMotion, '-rotate-[1.5deg]')}>
      <h2 className={cardTitle}>{t('title')}</h2>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-full bg-[#FFE3D3] font-extrabold text-brand-text-dark"
        >
          {t('initial')}
        </span>
        <span className="flex-1 text-sm font-bold">{t('name')}</span>
        <span className="rounded-full bg-brand-tint px-2.5 py-1 text-xs font-bold text-brand-text-dark">
          {t('status')}
        </span>
      </div>
      <dl className="flex flex-col gap-2.5 border-t border-line pt-3 text-[13px]">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="font-bold">{t(label)}</dt>
            <dd className="text-muted">{t(value)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function CoupleCard() {
  const t = useTranslations('landing.preview.couple');
  // Colour is always paired with a text label underneath.
  const stats = [
    ['affectedValue', 'affected', 'text-danger'],
    ['carrierValue', 'carrier', 'text-brand-text'],
    ['unaffectedValue', 'unaffected', 'text-unaffected'],
  ] as const;

  return (
    <Card as="article" className={cn(cardBase, cardMotion, 'rotate-1 items-center text-center')}>
      <h2 className={cardTitle}>{t('title')}</h2>
      <div role="img" aria-label={t('partnersLabel')} className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-full bg-[#FFE3D3] font-extrabold text-brand-text-dark">
          {t('partnerA')}
        </span>
        <span className="font-bold text-muted">+</span>
        <span className="flex size-11 items-center justify-center rounded-full bg-info-tint font-extrabold text-info-text">
          {t('partnerB')}
        </span>
      </div>
      <span className="rounded-full bg-success-tint px-3 py-1 text-xs font-bold text-success-text">
        {t('consent')}
      </span>
      <div className="w-full rounded-input border border-line p-3">
        <p className="text-start text-xs font-bold">{t('chanceTitle')}</p>
        <dl className="mt-2 grid grid-cols-3 gap-1.5">
          {stats.map(([value, label, colour]) => (
            <div key={label} className="flex flex-col-reverse">
              <dt className="text-[11px] text-muted">{t(label)}</dt>
              <dd dir="ltr" className={cn('text-[22px] font-extrabold', colour)}>
                {t(value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}

function SimulatorCard() {
  const t = useTranslations('landing.preview.simulator');

  return (
    <Card as="article" className={cn(cardBase, cardMotion, '-rotate-1')}>
      <h2 className={cardTitle}>{t('title')}</h2>
      <PunnettPreview caption={t('gridLabel')} parentA={t('parentA')} parentB={t('parentB')} />
    </Card>
  );
}

function CounsellorCard() {
  const t = useTranslations('landing.preview.counsellor');

  return (
    <Card as="article" className={cn(cardBase, cardMotion, 'rotate-[1.5deg] items-center text-center')}>
      <h2 className={cardTitle}>{t('title')}</h2>
      <span
        aria-hidden="true"
        className="flex size-[72px] items-center justify-center rounded-full bg-ink text-[22px] font-extrabold text-white"
      >
        {t('initials')}
      </span>
      <div>
        <p className="text-[15px] font-bold">{t('name')}</p>
        <p className="text-[13px] text-muted">{t('role')}</p>
      </div>
      <span className="flex items-center gap-1.5 text-xs font-semibold text-success-text">
        <span aria-hidden="true" className="size-2 rounded-full bg-[#16A34A]" />
        {t('available')}
      </span>
      <Button href="/counsellor" variant="dark" size="sm">
        {t('cta')}
      </Button>
    </Card>
  );
}

export function PreviewCards() {
  const t = useTranslations('landing.preview');

  return (
    <section
      aria-label={t('label')}
      className="mx-auto grid max-w-[1280px] grid-cols-1 gap-[22px] p-6 sm:grid-cols-2 xl:grid-cols-4"
    >
      {[ProfileCard, CoupleCard, SimulatorCard, CounsellorCard].map((PreviewCard, index) => (
        // The entrance animation sits on a wrapper so it never fights the
        // card's own hover transform.
        <div key={index} className={cn('flex flex-col [&>*]:flex-1', entrance[index])}>
          <PreviewCard />
        </div>
      ))}
    </section>
  );
}
