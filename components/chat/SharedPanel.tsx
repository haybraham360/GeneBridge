'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { openShared, type SharedItem } from '@/app/[locale]/chatActions';
import type { ChatShareItem } from '@/lib/chat/types';

type Grant = { resource: ChatShareItem; level: string };

/**
 * What the patient shared with this professional (task 15, section 3).
 * Only the list shows until the professional opens an item; each opening
 * is written to the patient's access log (guardrail 10).
 */
export function SharedPanel({ conversationId, grants }: { conversationId: string; grants: Grant[] }) {
  const t = useTranslations('chat.shared');
  const tv = useTranslations('pro.detail.valueQuestions');
  const locale = useLocale();
  const [open, setOpen] = useState<SharedItem | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const question = tv as unknown as (key: string) => string;

  return (
    <aside className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-card" aria-labelledby="shared-title" data-testid="shared-panel">
      <h2 id="shared-title" className="text-[16px] font-extrabold">{t('title')}</h2>
      {grants.length === 0 ? <p className="text-[13px] text-neutral-600">{t('empty')}</p> : <p className="text-[12px] text-neutral-500">{t('logged')}</p>}
      <ul className="flex flex-col gap-2">
        {grants.map((g) => (
          <li key={g.resource} className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 p-3 text-[14px]">
            <span className="font-bold">{t(g.resource)}</span>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await openShared(conversationId, g.resource, locale);
                  if ('status' in result) setFailed(true);
                  else setOpen(result);
                })
              }
              className="min-h-11 cursor-pointer rounded-full border border-neutral-300 px-4 text-[13px] font-bold"
            >
              {t('open')}
            </button>
          </li>
        ))}
      </ul>
      {failed ? <p role="alert" className="text-[12px] font-semibold text-red-700">{t('empty')}</p> : null}
      {open ? (
        <section className="rounded-xl bg-neutral-50 p-3 text-[13px]" aria-live="polite">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">{t(open.resource)}</h3>
            <button type="button" onClick={() => setOpen(null)} className="min-h-9 cursor-pointer text-[12px] font-bold underline">{t('close')}</button>
          </div>
          {open.resource === 'result' ? (
            <ul className="mt-2 flex flex-col gap-1">
              {open.items.map((i, n) => (
                <li key={n}>
                  <span className="font-semibold">{i.condition}</span>: {t(`status.${i.status as 'carrier'}`)}
                  {i.flagged ? ` · ${t('flagged')}` : ''}
                  {i.unverified ? ` · ${t('unverified')}` : ''}
                </li>
              ))}
            </ul>
          ) : open.resource === 'values_summary' ? (
            <ul className="mt-2 flex flex-col gap-1">
              {open.items.map((i) => (
                <li key={i.questionId}>
                  {safe(question, i.questionId)}: {t(`bands.${i.band as 'important'}`)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2">{t('relatives', { count: open.relatives })}</p>
          )}
        </section>
      ) : null}
    </aside>
  );
}

function safe(t: (key: string) => string, key: string): string {
  try {
    return t(key);
  } catch {
    return key;
  }
}
