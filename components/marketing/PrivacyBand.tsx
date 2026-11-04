import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { CheckList } from './CheckList';

/** Static mock of a sharing switch. Not interactive on the landing page. */
function MockSwitch({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="relative inline-block h-[26px] w-11 shrink-0">
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className={cn('absolute inset-0 rounded-full', on ? 'bg-ink' : 'bg-neutral-fill')}
      />
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-[3px] size-5 rounded-full',
          on ? 'end-[3px] bg-brand' : 'start-[3px] bg-white',
        )}
      />
    </span>
  );
}

export function PrivacyBand() {
  const t = useTranslations('landing.privacy');
  const rows = [
    { name: t('card.partner'), level: t('card.partnerLevel'), on: true },
    { name: t('card.counsellor'), level: t('card.counsellorLevel'), on: true },
    { name: t('card.family'), level: t('card.familyLevel'), on: false },
  ];

  return (
    <section className="mx-auto mt-28 max-w-page px-6">
      <div className="flex flex-wrap items-center gap-12 rounded-[32px] bg-ink p-[clamp(32px,5vw,64px)] text-white">
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-5">
          <p className="text-xs font-extrabold tracking-[0.18em] text-[#FF8A5C] uppercase">{t('eyebrow')}</p>
          <h2 className="text-[clamp(32px,4vw,46px)] leading-[1.1] font-extrabold tracking-[-0.02em]">
            {t('title')}
          </h2>
          <CheckList
            className="gap-3.5"
            items={[t('point1'), t('point2'), t('point3'), t('point4')]}
          />
        </div>

        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-3.5 rounded-3xl bg-white p-6 text-ink">
          <h3 className="text-base font-extrabold">{t('card.title')}</h3>
          <ul className="flex flex-col gap-3.5">
            {rows.map((row) => (
              <li
                key={row.name}
                className="flex items-center justify-between gap-3 rounded-input border border-line p-3"
              >
                <div>
                  <p className="text-sm font-bold">{row.name}</p>
                  <p className="text-[13px] text-muted">{row.level}</p>
                </div>
                <MockSwitch on={row.on} label={row.on ? t('card.on') : t('card.off')} />
              </li>
            ))}
          </ul>
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <Lock aria-hidden="true" className="size-4 shrink-0" />
            {t('card.log')}
          </p>
        </div>
      </div>
    </section>
  );
}
