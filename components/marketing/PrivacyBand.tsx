import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CheckList } from './CheckList';
import { SharingToggles, type SharingRow } from './SharingToggles';

export function PrivacyBand() {
  const t = useTranslations('landing.privacy');
  const rows: SharingRow[] = [
    { id: 'partner', name: t('card.partner'), onLevel: t('card.partnerLevel'), initiallyOn: true },
    { id: 'counsellor', name: t('card.counsellor'), onLevel: t('card.counsellorLevel'), initiallyOn: true },
    // Turning family on grants the smallest level, a summary.
    { id: 'family', name: t('card.family'), onLevel: t('card.partnerLevel'), initiallyOn: false },
  ];

  return (
    <section className="mx-auto mt-28 max-w-page px-6">
      <div className="reveal flex flex-wrap items-center gap-12 rounded-[32px] bg-ink p-[clamp(32px,5vw,64px)] text-white">
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-5">
          <p className="text-xs font-extrabold tracking-[0.18em] text-[#FF8A5C] uppercase">{t('eyebrow')}</p>
          <h2 className="font-display text-[clamp(32px,4vw,46px)] leading-[1.1] font-extrabold tracking-[-0.02em]">
            {t('title')}
          </h2>
          <CheckList
            className="gap-3.5"
            items={[t('point1'), t('point2'), t('point3'), t('point4')]}
          />
        </div>

        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-3.5 rounded-3xl bg-white p-6 text-ink">
          <h3 className="text-base font-extrabold">{t('card.title')}</h3>
          <SharingToggles rows={rows} offLevel={t('card.familyLevel')} />
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <Lock aria-hidden="true" className="size-4 shrink-0" />
            {t('card.log')}
          </p>
        </div>
      </div>
    </section>
  );
}
