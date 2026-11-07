'use client';

import { BadgeCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { acceptOffer } from '@/app/[locale]/(app)/dashboard/counsellor/actions';
import { useRouter } from '@/i18n/navigation';
import type { RequestOffer } from '@/lib/booking/server';

/**
 * Professionals who offered to take the patient's open request (escalations
 * and flagged results, task 15 section 2). The patient chooses one.
 */
export function OffersPanel({ offers }: { offers: RequestOffer[] }) {
  const t = useTranslations('directory.offers');
  const tl = useTranslations('proOnboarding.labels');
  const locale = useLocale();
  const router = useRouter();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const langName = useMemo(() => {
    const dn = new Intl.DisplayNames(locale, { type: 'language' });
    return (code: string) => dn.of(code) ?? code;
  }, [locale]);

  if (offers.length === 0 && !done) return null;

  return (
    <section className="rounded-2xl border border-brand/40 bg-[#FFF1E7] p-5" aria-labelledby="offers-title" data-testid="offers">
      <h2 id="offers-title" className="text-[16px] font-extrabold text-ink">{t('title')}</h2>
      <p className="mt-1 text-[13px] text-neutral-700">{t('body')}</p>
      {done ? <p role="status" className="mt-3 text-[13px] font-semibold text-[#166534]">{t('accepted', { name: done })}</p> : null}
      {error ? <p role="alert" className="mt-3 text-[13px] font-semibold text-red-700">{t('error')}</p> : null}
      <ul className="mt-3 flex flex-col gap-2">
        {offers.map((o) => (
          <li key={o.offerId} className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold">{o.displayName}</p>
              <p className="text-[12px] text-neutral-600">
                {o.profession ? tl(`profession.${o.profession}` as 'profession.other') : ''} · {o.languages.map(langName).join(', ')}
              </p>
              {o.licenceAuthority ? (
                <p className="inline-flex items-center gap-1 text-[12px] font-bold text-[#166534]">
                  <BadgeCheck aria-hidden className="size-3.5" /> {tl(`authority.${o.licenceAuthority}` as 'authority.other')}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await acceptOffer(o.offerId).catch(() => ({ status: 'error' as const }));
                  if (result.status !== 'ok') return setError(true);
                  setDone(o.displayName);
                  router.refresh();
                })
              }
              className="min-h-11 cursor-pointer rounded-full bg-ink px-4 text-[13px] font-bold text-white"
            >
              {t('accept', { name: o.displayName })}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
