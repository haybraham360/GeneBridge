'use client';

import { CircleAlert, Info, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useMemo, useState, type RefObject } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { plainResult, resolveOne, type CatalogueFacts } from '@/lib/scan/resolveCore';
import { reportTypes, type ReportType } from '@/lib/scan/schema';
import type { CheckedFinding, CheckedReport, ScanDraft } from '@/lib/scan/types';
import type { CatalogueOption } from './ScanFlow';

type Props = {
  headingRef: RefObject<HTMLHeadingElement | null>;
  draft: ScanDraft;
  report: CheckedReport;
  onReportChange: (report: CheckedReport) => void;
  onCorrected: () => void;
  catalogue: CatalogueOption[];
  /** Resolves false if the explanation couldn't be prepared. */
  onExplain: (report: CheckedReport, ownReport: boolean) => Promise<boolean>;
  onRescan: () => void;
};

const inputClasses =
  'min-h-12 w-full rounded-input border border-line-strong bg-surface px-4 text-base text-ink focus-visible:border-ink';

/** The person picks a plain result; the server maps it with the catalogue pattern. */
const plainToReported = { carrier: 'carrier', not_detected: 'not_detected', specialist: 'uncertain' } as const;

/**
 * "Check what we found" (task 12): what was read, for the person to check
 * before anything is explained as theirs or saved. Low-confidence fields
 * are highlighted, with a way to correct or skip them.
 */
export function CheckStep({ headingRef, draft, report, onReportChange, onCorrected, catalogue, onExplain, onRescan }: Props) {
  const t = useTranslations('scan');
  const [own, setOwn] = useState(false);
  const [permission, setPermission] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [wrongOpen, setWrongOpen] = useState(false);
  const ids = { type: useId(), date: useId(), lab: useId() };

  const facts = useMemo(() => {
    const byId = new Map(catalogue.map((c) => [c.id, c]));
    return (id: string): CatalogueFacts | null => byId.get(id) ?? null;
  }, [catalogue]);
  const titleOf = (id: string | null) => catalogue.find((c) => c.id === id)?.title ?? null;
  const carrierScreen = report.report.reportType === 'carrier_screening';

  const updateFinding = (key: string, change: Partial<CheckedFinding>, corrected = true) => {
    onReportChange({ ...report, findings: report.findings.map((f) => (f.key === key ? { ...f, ...change } : f)) });
    if (corrected) onCorrected();
  };
  const updateDetails = (change: Partial<CheckedReport['report']>) => {
    onReportChange({ ...report, report: { ...report.report, ...change } });
    onCorrected();
  };

  const submit = async () => {
    setPending(true);
    setError(false);
    const ok = await onExplain(report, own);
    if (!ok) {
      setError(true);
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="check-title" className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id="check-title" ref={headingRef} tabIndex={-1} className="text-[32px] leading-tight font-extrabold tracking-[-0.02em] outline-none">
          {t('check.title')}
        </h1>
        <p className="text-[15px] leading-[1.6] text-muted">{t('check.intro')}</p>
      </header>

      <section aria-labelledby="details-title" className={cn(cardClasses, 'flex flex-col gap-4 p-6')}>
        <h2 id="details-title" className="text-lg font-extrabold">
          {t('check.details')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.type} className="text-sm font-bold">
              {t('check.reportType')}
            </label>
            <select
              id={ids.type}
              value={report.report.reportType}
              onChange={(e) => updateDetails({ reportType: e.target.value as ReportType })}
              className={inputClasses}
            >
              {reportTypes.map((type) => (
                <option key={type} value={type}>
                  {t(`check.reportTypes.${type}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.date} className="text-sm font-bold">
              {t('check.date')}
            </label>
            <input
              id={ids.date}
              type="date"
              value={report.report.reportDate ?? ''}
              onChange={(e) => updateDetails({ reportDate: e.target.value || null })}
              className={inputClasses}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.lab} className="text-sm font-bold">
              {t('check.lab')}
            </label>
            <input
              id={ids.lab}
              type="text"
              maxLength={120}
              value={report.report.labName ?? ''}
              onChange={(e) => updateDetails({ labName: e.target.value || null })}
              className={inputClasses}
            />
          </div>
        </div>
        {!carrierScreen ? (
          <p role="status" data-testid="other-report" className="flex items-start gap-2 rounded-tile bg-brand-tint p-4 text-[15px] font-semibold text-brand-text-dark">
            <Info aria-hidden="true" className="mt-0.5 size-5 flex-none" strokeWidth={2} />
            {t('check.otherReport')}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="findings-title" className="flex flex-col gap-3">
        <h2 id="findings-title" className="text-lg font-extrabold">
          {t('check.findings')}
        </h2>
        {report.findings.length === 0 ? <p className="text-[15px] text-muted">{t('check.none')}</p> : null}
        <ul className="flex flex-col gap-3" data-testid="check-findings">
          {report.findings.map((f) => {
            const original = draft.findings.find((d) => d.key === f.key);
            const { status, flag } = resolveOne(
              {
                conditionId: f.conditionId,
                zygosity: f.zygosity,
                classification: f.classification,
                reportedResult: f.reportedResult,
                lowConfidenceUnconfirmed: f.lowConfidence && !f.confirmed,
              },
              facts,
              carrierScreen,
            );
            const plain = plainResult(status, flag.flagged);
            // What the report says, before the "couldn't read clearly" flag: the editor starts from this.
            const read = resolveOne(
              { conditionId: f.conditionId, zygosity: f.zygosity, classification: f.classification, reportedResult: f.reportedResult, lowConfidenceUnconfirmed: false },
              facts,
              carrierScreen,
            );
            const readPlain = plainResult(read.status, read.flag.flagged);
            const title = titleOf(f.conditionId) ?? f.conditionText;
            const suggestion = !f.conditionId && original?.suggestion ? original.suggestion : null;
            const unclear = f.lowConfidence && !f.confirmed;
            const needsPick = !f.conditionId;
            return (
              <li
                key={f.key}
                data-testid="check-finding"
                className={cn(cardClasses, 'flex flex-col gap-3 p-5', unclear && 'border-2 border-brand', f.skipped && 'opacity-70')}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <p className="text-lg font-extrabold">{title}</p>
                    {f.gene ? (
                      <p className="text-[13px] text-muted">
                        {t.rich('check.gene', { gene: f.gene, g: (c) => <bdi dir="ltr">{c}</bdi> })}
                      </p>
                    ) : null}
                  </div>
                  {!f.skipped ? (
                    <span
                      data-testid="check-result"
                      className={cn(
                        'flex-none rounded-full px-3 py-1 text-xs font-bold',
                        plain === 'carrier' ? 'bg-brand-tint text-brand-text-dark' : plain === 'not_detected' ? 'bg-success-tint text-success-text' : 'bg-info-tint text-info-text',
                      )}
                    >
                      {t(`check.results.${plain}`)}
                    </span>
                  ) : null}
                </div>

                <p className="text-[13px] text-muted">
                  {t('check.asWritten')} <q className="font-semibold text-ink-soft">{f.conditionText}</q>
                </p>

                {f.skipped ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm">{t('check.skipped')}</p>
                    <button type="button" onClick={() => updateFinding(f.key, { skipped: false })} className={buttonClasses('ghost', 'sm')}>
                      <Undo2 aria-hidden="true" className="size-4" strokeWidth={2} />
                      {t('check.undoSkip')}
                    </button>
                  </div>
                ) : (
                  <>
                    {unclear ? (
                      <p className="flex items-start gap-2 text-sm font-bold text-brand-text-dark" data-testid="unclear">
                        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 flex-none" strokeWidth={2} />
                        <span>
                          {t('check.unclear')}. <span className="font-normal">{t('check.unclearHint')}</span>
                        </span>
                      </p>
                    ) : null}

                    {suggestion ? (
                      <div className="flex flex-wrap items-center gap-3 rounded-tile bg-bg p-3">
                        <p className="text-sm font-bold">{t('check.suggestion', { condition: titleOf(suggestion) ?? suggestion })}</p>
                        <button
                          type="button"
                          onClick={() => updateFinding(f.key, { conditionId: suggestion, confirmed: true })}
                          className={buttonClasses('dark', 'sm')}
                        >
                          {t('check.useSuggestion')}
                        </button>
                      </div>
                    ) : needsPick ? (
                      <p className="text-sm text-muted" data-testid="unmatched">
                        {t('check.unmatched')}
                      </p>
                    ) : null}

                    {unclear || needsPick || f.confirmed ? (
                      <FindingEditor
                        finding={f}
                        plain={readPlain}
                        catalogue={catalogue}
                        onChange={(change) => updateFinding(f.key, change)}
                      />
                    ) : null}

                    {unclear ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
                          <input
                            type="checkbox"
                            checked={f.confirmed}
                            onChange={(e) => updateFinding(f.key, { confirmed: e.target.checked })}
                            className="size-5 accent-ink"
                          />
                          {t('check.confirm')}
                        </label>
                        <button type="button" onClick={() => updateFinding(f.key, { skipped: true })} className={buttonClasses('ghost', 'sm')}>
                          {t('check.skip')}
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className={cn(cardClasses, 'flex flex-col gap-3 p-6')}>
        {draft.namePresent ? <p className="text-sm text-muted">{t('check.nameNote')}</p> : null}
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-bold">
          <input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} className="size-5 accent-ink" data-testid="own-report" />
          {t('check.own')}
        </label>
        {draft.namePresent ? (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-bold">
            <input type="checkbox" checked={permission} onChange={(e) => setPermission(e.target.checked)} className="size-5 accent-ink" />
            {t('check.permission')}
          </label>
        ) : null}
        <p className="text-sm text-muted">{t('check.ownHint')}</p>
      </section>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {t('check.explainError')}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={pending}
          aria-busy={pending || undefined}
          className={buttonClasses('primary', 'lg', 'disabled:cursor-not-allowed disabled:opacity-60')}
        >
          {pending ? t('check.explaining') : t('check.explain')}
        </button>
        <button type="button" aria-expanded={wrongOpen} onClick={() => setWrongOpen((v) => !v)} className={buttonClasses('ghost', 'lg')}>
          {t('check.wrong')}
        </button>
      </div>
      {wrongOpen ? (
        <div className={cn(cardClasses, 'flex flex-col gap-3 p-5')}>
          <p className="font-extrabold">{t('check.wrongTitle')}</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={onRescan} className={buttonClasses('dark', 'md')}>
              {t('check.wrongBack')}
            </button>
            <Link href="/dashboard/counsellor" className={buttonClasses('ghost', 'md')}>
              {t('check.wrongCounsellor')}
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function FindingEditor({
  finding,
  plain,
  catalogue,
  onChange,
}: {
  finding: CheckedFinding;
  plain: 'carrier' | 'not_detected' | 'specialist';
  catalogue: CatalogueOption[];
  onChange: (change: Partial<CheckedFinding>) => void;
}) {
  const t = useTranslations('scan.check');
  const conditionId = useId();
  const resultId = useId();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={conditionId} className="text-sm font-bold">
          {t('condition')}
        </label>
        <select
          id={conditionId}
          value={finding.conditionId ?? ''}
          onChange={(e) => onChange({ conditionId: e.target.value || null, confirmed: true })}
          className={inputClasses}
        >
          <option value="">{finding.conditionId ? t('notListed') : t('chooseCondition')}</option>
          {catalogue.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={resultId} className="text-sm font-bold">
          {t('result')}
        </label>
        <select
          id={resultId}
          value={plain}
          onChange={(e) =>
            onChange({
              reportedResult: plainToReported[e.target.value as keyof typeof plainToReported],
              // The person's own reading replaces the model's details.
              zygosity: 'unknown',
              classification: 'unknown',
              confirmed: true,
            })
          }
          className={inputClasses}
        >
          {(['carrier', 'not_detected', 'specialist'] as const).map((r) => (
            <option key={r} value={r}>
              {t(`results.${r}`)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
