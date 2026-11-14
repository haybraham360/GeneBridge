'use client';

import { Stethoscope, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DemoAccount } from '@/lib/auth/uaePass';
import { FieldError } from './FieldError';

const accounts: { key: DemoAccount; Icon: typeof UserRound }[] = [
  { key: 'mariam', Icon: UserRound },
  { key: 'amaka', Icon: Stethoscope },
];

/**
 * "Try the prototype": one-click sign-in to a synthetic demo account, no
 * password. Shown only in demo mode (NEXT_PUBLIC_DEMO_MODE=true).
 */
export function DemoAccounts({
  busy,
  pending,
  error,
  onChoose,
}: {
  busy: boolean;
  /** The account being signed in, for the status line. */
  pending: DemoAccount | null;
  error?: string;
  onChoose: (account: DemoAccount) => void;
}) {
  const t = useTranslations('auth.demo');

  return (
    <section
      aria-labelledby="demo-accounts-title"
      className="flex flex-col gap-4 rounded-card border border-line bg-brand-tint-soft p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="demo-accounts-title" className="text-base font-extrabold tracking-[-0.02em]">
          {t('title')}
        </h2>
        <p className="text-sm leading-[1.5] text-muted">{t('body')}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {accounts.map(({ key, Icon }) => (
          <li key={key}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onChoose(key)}
              className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-tile border border-line-strong bg-surface px-4 py-3 text-start transition-colors duration-200 hover:bg-brand-tint-soft disabled:cursor-wait disabled:opacity-60"
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand-text-dark"
              >
                <Icon className="size-5" />
              </span>
              <span className="flex flex-col">
                <span className="font-bold">{t(`accounts.${key}.label`)}</span>
                <span className="text-[13px] leading-[1.45] text-muted">
                  {t(`accounts.${key}.hint`)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="text-[13px] text-muted empty:hidden">
        {pending ? t('signingIn', { name: t(`accounts.${pending}.label`) }) : null}
      </p>
      <FieldError id="demo-error" message={error} />
    </section>
  );
}
