'use client';

import { Check, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { agreeCoupleView, withdrawCoupleView } from '@/app/[locale]/(app)/dashboard/couple/actions';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import type { ConsentStatus } from '@/lib/couple/view';

const levels = ['shared_only', 'summary', 'full'] as const;
type Level = (typeof levels)[number];

/** Unlock your couple view (design CoupleConsent): choose a level, agree, or withdraw. */
export function ConsentForm({ consent, myInitial }: { consent: ConsentStatus; myInitial: string | null }) {
  const t = useTranslations('couple.consent');
  const tc = useTranslations('couple');
  const router = useRouter();
  const [level, setLevel] = useState<Level>(consent.meLevel ?? 'shared_only');
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const partner = consent.partnerName ?? tc('yourPartner');

  const agree = () =>
    start(async () => {
      const result = await agreeCoupleView(level).catch(() => ({ status: 'error' as const }));
      setStatus(result.status === 'agreed' ? t('saved') : result.status === 'no_partner' ? t('noPartner') : t('error'));
      if (result.status === 'agreed') router.refresh();
    });
  const withdraw = () =>
    start(async () => {
      const result = await withdrawCoupleView().catch(() => ({ ok: false }));
      setStatus(result.ok ? t('withdrawn') : t('error'));
      if (result.ok) router.refresh();
    });

  const pill = (agreed: boolean, waitingLabel: string) => (
    <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', agreed ? 'bg-success-tint text-success-text' : 'bg-neutral-fill text-ink-soft')}>
      {agreed ? t('agreed') : waitingLabel}
    </span>
  );

  return (
    <div className="mt-6 grid items-start gap-5 lg:grid-cols-[2fr_1fr]">
      <section className={cn(cardClasses, 'flex flex-col gap-5 p-[clamp(24px,4vw,36px)]')}>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl font-extrabold">{t('whatSee', { partner })}</h2>
          <p className="text-[15px] text-muted">{t('whatSeeBody', { partner })}</p>
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">{t('whatSee', { partner })}</legend>
          {levels.map((l) => (
            <label
              key={l}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-tile border p-4',
                level === l ? 'border-2 border-brand bg-brand-tint-soft' : 'border-line-strong bg-surface',
              )}
            >
              <input type="radio" name="level" checked={level === l} onChange={() => setLevel(l)} className="mt-1 size-5 accent-brand" />
              <span className="flex flex-col gap-1">
                <span className="font-extrabold">{t(`options.${l}.title`)}</span>
                <span className="text-sm leading-normal text-muted">{t(`options.${l}.body`, { partner })}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-tile bg-bg p-4">
            <p className="font-extrabold">{t('bothSee')}</p>
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {[t('bothSee1'), t('bothSee2')].map((x) => (
                <li key={x} className="flex items-start gap-2">
                  <Check aria-hidden="true" className="mt-0.5 size-4 flex-none text-unaffected" strokeWidth={2.5} />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-tile bg-bg p-4">
            <p className="font-extrabold">{t('private')}</p>
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {[t('private1'), t('private2'), t('private3')].map((x) => (
                <li key={x} className="flex items-start gap-2">
                  <Lock aria-hidden="true" className="mt-0.5 size-4 flex-none text-muted" strokeWidth={2} />
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={agree} disabled={pending} className={buttonClasses('primary', 'md', 'disabled:opacity-60')}>
            {consent.meAgreed ? t('update') : t('agree')}
          </button>
          {consent.meAgreed ? (
            <button type="button" onClick={withdraw} disabled={pending} className={buttonClasses('ghost', 'md')}>
              {t('withdraw')}
            </button>
          ) : (
            <Link href="/dashboard" className={buttonClasses('ghost', 'md')}>
              {t('notNow')}
            </Link>
          )}
        </div>
        <p role="status" aria-live="polite" className="text-sm font-semibold">
          {status}
        </p>
        <p className="text-sm text-muted">{t('note')}</p>
      </section>

      <aside className="flex flex-col gap-5">
        <section className={cn(cardClasses, 'flex flex-col gap-3 p-6')}>
          <h2 className="text-xl font-extrabold">{t('status')}</h2>
          <div className="flex items-center gap-3 rounded-tile bg-bg px-4 py-3">
            <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-[#FFE3D3] font-extrabold text-brand-text-dark">
              {myInitial ?? ''}
            </span>
            <span className="flex-1 font-bold">{tc('you')}</span>
            {pill(consent.meAgreed, t('notYet'))}
          </div>
          <div className="flex items-center gap-3 rounded-tile bg-bg px-4 py-3">
            <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-info-tint font-extrabold text-info-text">
              {partner.charAt(0).toLocaleUpperCase()}
            </span>
            <span className="flex-1 font-bold">{partner}</span>
            {pill(consent.partnerAgreed, t('waiting'))}
          </div>
        </section>
        <section className={cn(cardClasses, 'flex flex-col gap-2 p-6')}>
          <h2 className="text-xl font-extrabold">{t('why')}</h2>
          <p className="text-[15px] leading-[1.6] text-muted">{t('whyBody')}</p>
        </section>
      </aside>
    </div>
  );
}
