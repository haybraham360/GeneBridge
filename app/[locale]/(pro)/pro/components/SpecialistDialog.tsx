'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition, type Ref } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import type { Service } from '@/lib/pro/types';
import { dialogClasses } from './dialog';

type Props = {
  ref: Ref<HTMLDialogElement>;
  services: Service[];
  onSubmit: (service: Service) => Promise<boolean>;
};

/** Picker of specialist services (haematology, IVF and embryo testing). */
export function SpecialistDialog({ ref, services, onSubmit }: Props) {
  const t = useTranslations('pro');
  const [choice, setChoice] = useState<string | null>(null);
  const [error, setError] = useState<'required' | 'failed' | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <dialog
      ref={ref}
      aria-labelledby="specialist-title"
      className={dialogClasses}
      onClose={() => {
        setChoice(null);
        setError(null);
      }}
    >
      <form
        method="dialog"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const dialog = event.currentTarget.closest('dialog');
          const service = services.find((s) => s.id === choice);
          if (!service) {
            setError('required');
            return;
          }
          startTransition(async () => {
            if (await onSubmit(service)) dialog?.close();
            else setError('failed');
          });
        }}
      >
        <div>
          <h2 id="specialist-title" className="text-xl font-extrabold">
            {t('specialist.title')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('specialist.body')}</p>
        </div>
        <fieldset className="flex flex-col gap-2" aria-describedby={error ? 'specialist-error' : undefined}>
          <legend className="mb-1 text-sm font-bold">{t('specialist.legend')}</legend>
          {services.map((s) => (
            <label
              key={s.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 text-sm has-checked:border-ink has-checked:bg-brand-tint-soft"
            >
              <input
                type="radio"
                name="service"
                value={s.id}
                checked={choice === s.id}
                onChange={() => {
                  setChoice(s.id);
                  setError(null);
                }}
                className="size-4 accent-ink"
              />
              <span className="flex flex-col">
                <span className="font-bold">{t(`specialist.kinds.${s.kind}`)}</span>
                <span className="text-muted">{s.name}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {error ? (
          <p id="specialist-error" role="alert" className="text-[13px] font-semibold text-danger">
            {error === 'required' ? t('specialist.required') : t('detail.actions.error')}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2.5">
          <button
            type="button"
            onClick={(e) => e.currentTarget.closest('dialog')?.close()}
            className={buttonClasses('ghost', 'sm')}
          >
            {t('specialist.cancel')}
          </button>
          <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm', 'disabled:opacity-60')}>
            {t('specialist.submit')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
