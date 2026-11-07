'use client';

import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { useRouter } from '@/i18n/navigation';
import { removeAllDemoData, type PurgeResult } from '../actions';

const CONFIRM_WORD = 'REMOVE';

/** "Remove all demo data": a modal dialog that needs REMOVE typed to confirm. */
export function RemoveAllDemoData({ disabled }: { disabled: boolean }) {
  const t = useTranslations('admin.demoData.removeAll');
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<PurgeResult | null>(null);
  const [pending, startTransition] = useTransition();
  const titleId = useId();
  const inputId = useId();
  const hintId = useId();

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const reset = () => setTyped('');
    el.addEventListener('close', reset);
    return () => el.removeEventListener('close', reset);
  }, []);

  const matches = typed.trim() === CONFIRM_WORD;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setResult(null);
          dialog.current?.showModal();
        }}
        className={buttonClasses('ghost', 'md', 'border-danger text-danger disabled:cursor-not-allowed disabled:opacity-50')}
      >
        {t('button')}
      </button>

      {result?.status === 'ok' ? (
        <p role="status" className="text-sm font-semibold text-unaffected">
          {t('done', { accounts: result.accounts, rows: result.rows, files: result.files })}
          {result.keptSelf ? ` ${t('keptSelf')}` : ''}
        </p>
      ) : null}

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-6 shadow-card backdrop:bg-ink/40"
      >
        <form
          method="dialog"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!matches) return;
            startTransition(async () => {
              const next = await removeAllDemoData(typed).catch(() => ({ status: 'error' as const }));
              setResult(next);
              if (next.status === 'ok') {
                dialog.current?.close();
                router.refresh();
              }
            });
          }}
        >
          <div className="flex items-start gap-3">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 flex-none text-danger" strokeWidth={2} />
            <div className="flex flex-col gap-2">
              <h2 id={titleId} className="text-lg font-extrabold">{t('title')}</h2>
              <p className="text-[15px] text-muted">{t('body')}</p>
            </div>
          </div>
          <label htmlFor={inputId} className="text-sm font-bold">
            {t('label', { word: CONFIRM_WORD })}
          </label>
          <input
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            dir="ltr"
            aria-describedby={hintId}
            className="min-h-12 rounded-input border border-line-strong bg-surface px-4 text-[15px]"
          />
          <p id={hintId} className="text-[13px] text-muted">{t('hint')}</p>
          {result && result.status !== 'ok' ? (
            <p role="alert" className="text-sm font-semibold text-danger">{t('error')}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={!matches || pending} className={buttonClasses('dark', 'sm', 'disabled:cursor-not-allowed disabled:opacity-50')}>
              {pending ? t('working') : t('confirm')}
            </button>
            <button type="button" onClick={() => dialog.current?.close()} className={buttonClasses('ghost', 'sm')}>
              {t('cancel')}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
