'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { useRouter } from '@/i18n/navigation';
import { openReport, resolveReport, type OpenedReport } from './actions';

export function ReportRow({ id, reason, status, when }: { id: string; reason: string; status: string; when: string }) {
  const t = useTranslations('chat');
  const router = useRouter();
  const [opened, setOpened] = useState<OpenedReport | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card" data-testid="report-row">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex-1 text-[15px] font-bold">{t(`report.reasons.${reason as 'other'}`)}</span>
        <span className="text-sm text-muted">{when}</span>
        <span className="rounded-full border border-line px-3 py-1 text-[13px] font-semibold">{t(`admin.status.${status as 'open'}`)}</span>
        {!opened ? (
          <button type="button" disabled={pending} onClick={() => startTransition(async () => setOpened(await openReport(id)))} className={buttonClasses('ghost', 'sm')}>
            {t('admin.open')}
          </button>
        ) : null}
      </div>
      {opened ? (
        <div className="flex flex-col gap-2 rounded-tile bg-bg p-3">
          <p className="text-[12px] text-muted">{t('admin.sender', { role: opened.senderRole })}</p>
          <p className="whitespace-pre-wrap text-[15px]" dir="auto">{opened.body ?? t('admin.deletedBody')}</p>
          {opened.status === 'open' ? (
            <div className="flex gap-2">
              <button type="button" disabled={pending} onClick={() => startTransition(async () => { await resolveReport(id, 'dismissed'); router.refresh(); })} className={buttonClasses('ghost', 'sm')}>
                {t('admin.dismiss')}
              </button>
              <button type="button" disabled={pending} onClick={() => startTransition(async () => { await resolveReport(id, 'actioned'); router.refresh(); })} className={buttonClasses('dark', 'sm')}>
                {t('admin.action')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
