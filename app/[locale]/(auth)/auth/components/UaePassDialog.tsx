'use client';

import { useEffect, useRef } from 'react';
import { UserRound, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FieldError } from './FieldError';

export type UaePassIdentityKey = 'mariam' | 'khalid' | 'patientR' | 'amaka' | 'analyst';
const identities: UaePassIdentityKey[] = ['mariam', 'khalid', 'patientR', 'amaka', 'analyst'];

const hintKey = {
  mariam: 'identityHint',
  khalid: 'identityHint',
  patientR: 'identityHint',
  amaka: 'identityHintCounsellor',
  layla: 'identityHintCounsellor',
  analyst: 'identityHintAnalyst',
} as const;

/** "Demo: UAE PASS" picker. The real integration isn't built yet (lib/auth/uaePass.ts). */
export function UaePassDialog({
  open,
  busy,
  error,
  onClose,
  onChoose,
}: {
  open: boolean;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onChoose: (identity: UaePassIdentityKey) => void;
}) {
  const t = useTranslations('auth.uaePass');
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="uaepass-title"
      aria-describedby="uaepass-body"
      onClose={onClose}
      onClick={(e) => {
        // Click on the backdrop closes the dialog.
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      className="m-auto w-[min(420px,calc(100%-32px))] rounded-card border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-ink/40 open:motion-safe:animate-fade-up"
    >
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id="uaepass-title" className="text-xl font-extrabold tracking-[-0.02em]">
            {t('dialogTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t('close')}
            className="-m-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-brand-tint-soft"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <p id="uaepass-body" className="text-[15px] leading-[1.55] text-muted">
          {t('dialogBody')}
        </p>
        <ul className="flex flex-col gap-3">
          {identities.map((key) => (
            <li key={key}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onChoose(key)}
                className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-tile border border-line-strong bg-surface px-4 text-start transition-colors duration-200 hover:bg-brand-tint-soft disabled:cursor-wait disabled:opacity-60"
              >
                <span
                  aria-hidden="true"
                  className="flex size-9 items-center justify-center rounded-full bg-brand-tint text-brand-text-dark"
                >
                  <UserRound className="size-5" />
                </span>
                <span className="flex flex-col">
                  <span className="font-bold">{t(`identities.${key}`)}</span>
                  <span className="text-[13px] text-muted">
                    {t(hintKey[key])}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div aria-live="polite" className="text-sm text-muted">
          {busy ? t('signingIn') : null}
        </div>
        <FieldError id="uaepass-error" message={error} />
      </div>
    </dialog>
  );
}
