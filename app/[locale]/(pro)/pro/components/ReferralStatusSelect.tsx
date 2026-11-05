'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { referralUpdates, type ReferralStatus, type ReferralUpdate } from '@/lib/pro/types';
import { updateReferralStatus } from '../actions';

/** Status picker for one referral. Each change updates the patient's tracker. */
export function ReferralStatusSelect({
  referralId,
  status,
  label,
}: {
  referralId: string;
  status: ReferralStatus;
  label: string;
}) {
  const t = useTranslations('pro');
  const [value, setValue] = useState<ReferralStatus>(status);
  const [message, setMessage] = useState<'saved' | 'error' | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="flex flex-col gap-1">
      <select
        aria-label={label}
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as ReferralUpdate;
          const previous = value;
          setValue(next);
          setMessage(null);
          startTransition(async () => {
            const result = await updateReferralStatus({ referralId, status: next });
            if (result.ok) setMessage('saved');
            else {
              setValue(previous);
              setMessage('error');
            }
          });
        }}
        className="min-h-11 rounded-input border border-line-strong bg-surface px-3 text-sm"
      >
        {status === 'ordered' ? <option value="ordered" disabled>{t('detail.statuses.ordered')}</option> : null}
        {referralUpdates.map((s) => (
          <option key={s} value={s}>
            {t(`detail.statuses.${s}`)}
          </option>
        ))}
      </select>
      <span role="status" aria-live="polite" className={message === 'error' ? 'text-xs text-danger' : 'text-xs text-muted'}>
        {message === 'saved' ? t('referrals.saved') : message === 'error' ? t('referrals.error') : ''}
      </span>
    </span>
  );
}
