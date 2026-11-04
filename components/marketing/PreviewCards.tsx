import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

const cardBase = 'flex flex-col gap-3.5 p-6';
const cardTitle = 'text-[17px] font-extrabold';

function ProfileCard() {
  const t = useTranslations('landing.preview.profile');
  const rows = [
    ['conditionLabel', 'condition'],
    ['inheritanceLabel', 'inheritance'],
    ['healthLabel', 'health'],
  ] as const;

  return (
    <Card as="article" className={cn(cardBase, '-rotate-[1.5deg]')}>
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
    <Card as="article" className={cn(cardBase, 'rotate-1 items-center text-center')}>
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
  const cell = 'rounded-lg py-3.5';

  // Genotype notation is always left-to-right, so the grid is pinned to LTR.
  return (
    <Card as="article" className={cn(cardBase, '-rotate-1')}>
      <h2 className={cardTitle}>{t('title')}</h2>
      <table dir="ltr" className="w-full table-fixed border-separate border-spacing-1.5 text-center text-[15px] font-bold">
        <caption className="sr-only">{t('gridLabel')}</caption>
        <thead>
          <tr>
            <td />
            <th scope="col" className="p-2">A</th>
            <th scope="col" className="p-2">S</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" className="py-3.5">A</th>
            <td className={cn(cell, 'bg-[#F7F2EE]')}>AA</td>
            <td className={cn(cell, 'bg-[#F7F2EE]')}>AS</td>
          </tr>
          <tr>
            <th scope="row" className="py-3.5">S</th>
            <td className={cn(cell, 'bg-[#F7F2EE]')}>AS</td>
            <td className={cn(cell, 'bg-affected-tint')}>SS</td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

function CounsellorCard() {
  const t = useTranslations('landing.preview.counsellor');

  return (
    <Card as="article" className={cn(cardBase, 'rotate-[1.5deg] items-center text-center')}>
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
      <ProfileCard />
      <CoupleCard />
      <SimulatorCard />
      <CounsellorCard />
    </section>
  );
}
