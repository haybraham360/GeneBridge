import { FileText } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { PatientSummary } from '@/lib/copilot/types';

/**
 * Session summaries from the patient's counsellor (task 16, section 3).
 * Only summaries the counsellor approved ever reach this list.
 */
export async function SessionSummaries({ summaries, locale }: { summaries: PatientSummary[]; locale: 'ar' | 'en' }) {
  if (summaries.length === 0) return null;
  const [t, format] = await Promise.all([getTranslations({ locale, namespace: 'booking.summaries' }), getFormatter({ locale })]);

  return (
    <section id="summaries" aria-labelledby="summaries-title" className="mx-auto mt-8 flex w-full max-w-3xl flex-col gap-3 scroll-mt-6" data-testid="session-summaries">
      <div className="flex flex-col gap-1">
        <h2 id="summaries-title" className="text-xl font-extrabold tracking-[-0.02em]">
          {t('title')}
        </h2>
        <p className="text-[15px] text-muted">{t('subtitle')}</p>
      </div>
      <ol className="flex flex-col gap-3">
        {summaries.map((s) => (
          <li key={s.id} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
            <p className="flex items-center gap-2 text-sm font-bold">
              <FileText aria-hidden="true" className="size-4.5 text-brand-text" strokeWidth={2} />
              {t('from', { name: s.counsellorName, date: format.dateTime(new Date(s.approvedAt), { day: 'numeric', month: 'long', year: 'numeric' }) })}
            </p>
            <p className="text-[15px] leading-[1.6] whitespace-pre-line" dir={s.locale === 'ar' ? 'rtl' : 'ltr'} lang={s.locale}>
              {s.body}
            </p>
            <p className="text-[13px] text-muted">{t(s.engine === 'ai' ? 'writtenWithAi' : 'written', { name: s.counsellorName })}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
