'use client';

import { Lock, ShieldCheck, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

type PrivacyStepProps = {
  agreed: boolean;
  onAgreedChange: (agreed: boolean) => void;
  showRequired: boolean;
};

const points = [
  { key: 'yours', icon: Lock },
  { key: 'choose', icon: Users },
  { key: 'change', icon: ShieldCheck },
] as const;

/** Step 5: three privacy points and the required agreement. */
export function PrivacyStep({ agreed, onAgreedChange, showRequired }: PrivacyStepProps) {
  const t = useTranslations('onboarding.steps.privacy');

  return (
    <>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        {points.map(({ key, icon: Icon }) => (
          <li key={key} className="flex flex-col gap-2 rounded-tile bg-bg p-[18px]">
            <Icon aria-hidden="true" className="size-6 text-brand-text" strokeWidth={2} />
            <span className="font-extrabold">{t(`points.${key}.title`)}</span>
            <span className="text-sm text-muted">{t(`points.${key}.body`)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1.5">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-semibold">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => onAgreedChange(event.target.checked)}
            aria-describedby={showRequired ? 'privacy-required' : undefined}
            aria-invalid={showRequired || undefined}
            className="size-[22px] flex-none cursor-pointer accent-ink"
          />
          {t('agree')}
        </label>
        {showRequired ? (
          <p id="privacy-required" role="alert" className="text-sm font-semibold text-danger">
            {t('required')}
          </p>
        ) : null}
      </div>
    </>
  );
}
