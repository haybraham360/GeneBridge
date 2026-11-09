'use client';

import { Camera, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { logResultsTeachback } from '@/app/[locale]/(app)/dashboard/results/actions';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { ListenPill } from '@/components/ui/ListenPill';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { conditionGuideHref, simulatorHref } from '@/lib/conditions/links';

export type FindingView = {
  id: string;
  status: 'carrier' | 'affected';
  title: string;
  pattern: string;
  gene: string | null;
  /** "Gene HBB", already translated. */
  geneLabel: string | null;
  carrierLabel: string;
  diseaseLabel: string;
  carrierShort: string;
  diseaseShort: string;
  explanation: string;
  simple: string;
  /** From a photographed report, not yet confirmed (task 12). */
  unverified: boolean;
};

type Props = {
  subtitle: string;
  screenedCount: number;
  findings: FindingView[];
  /** Some findings come from a photographed report. */
  unverified: boolean;
};

const answerKey = { q1: 'b', q2: 'a', q3: 'a' } as const;
const questionIds = { q1: 'carrier_ill', q2: 'different_condition', q3: 'who_explains' } as const;
type Q = keyof typeof answerKey;
const explanations = { q1: 'e1', q2: 'e2', q3: 'e3' } as const;

/**
 * Your results, explained (task 10, design RiskAnalysis): a summary, every
 * finding from the person's own report, and the selected finding's detail
 * from the condition catalogue. Never shown for a flagged report.
 */
export function ResultsView({ subtitle, screenedCount, findings, unverified }: Props) {
  const t = useTranslations('results');
  const [selectedId, setSelectedId] = useState(findings[0]?.id ?? null);
  const [simple, setSimple] = useState(false);
  const [answers, setAnswers] = useState<Record<Q, 'a' | 'b' | null>>({ q1: null, q2: null, q3: null });
  const [checked, setChecked] = useState(false);
  const [needsAll, setNeedsAll] = useState(false);

  const selected = findings.find((f) => f.id === selectedId) ?? findings[0] ?? null;
  const carriers = findings.filter((f) => f.status === 'carrier');
  const affected = findings.some((f) => f.status === 'affected');

  const heading = affected ? t('summary.affected') : findings.length ? t('summary.carrier', { count: findings.length }) : t('summary.none');
  const summaryBody = affected ? t('summary.affectedBody') : findings.length ? (simple ? t('summary.carrierBodySimple') : t('summary.carrierBody')) : t('summary.noneBody');

  const detailHeading = (f: FindingView) =>
    f.status === 'affected'
      ? t('detail.affectedHeading', { condition: f.title })
      : f.gene && !f.gene.includes(',')
        ? t('detail.carrierHeading', { gene: f.gene, condition: f.title })
        : t('detail.carrierHeadingNoGene', { condition: f.title });

  const check = () => {
    if (Object.values(answers).some((a) => a === null)) {
      setNeedsAll(true);
      return;
    }
    setNeedsAll(false);
    setChecked(true);
    void logResultsTeachback(
      (Object.keys(answerKey) as Q[]).map((q) => ({ question: questionIds[q], correct: answers[q] === answerKey[q] })),
    ).catch(() => {});
  };

  const listen = [heading, summaryBody, selected ? `${detailHeading(selected)} ${simple ? selected.simple : selected.explanation}` : ''].join(' ');
  const bold = (chunks: React.ReactNode) => <strong className="font-extrabold">{chunks}</strong>;

  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-auto px-[clamp(16px,3vw,40px)] pt-9 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">{t('title')}</h1>
          <p className="text-[15px] text-muted">{subtitle}</p>
          {unverified ? (
            <p data-testid="from-photo" className="inline-flex w-fit items-center gap-2 rounded-full bg-info-tint px-3.5 py-1.5 text-[13px] font-bold text-info-text">
              <Info aria-hidden="true" className="size-4" strokeWidth={2} />
              {t('fromPhoto')}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard/scan?from=results" className={buttonClasses('ghost', 'md')}>
            <Camera aria-hidden="true" className="size-5" strokeWidth={2} />
            {t('scanAnother')}
          </Link>
          <ListenPill text={listen} play={t('listen')} stop={t('stop')} />
          <label className={buttonClasses('ghost', 'md', 'cursor-pointer')}>
            <input type="checkbox" checked={simple} onChange={(e) => setSimple(e.target.checked)} className="size-4 accent-ink" />
            {t('simpler')}
          </label>
        </div>
      </header>

      <section className={cn(cardClasses, 'mt-6 flex flex-wrap items-center justify-between gap-5 p-[clamp(24px,4vw,36px)]')}>
        <div className="flex max-w-[640px] flex-col gap-3">
          <p data-testid="results-summary" className="text-[clamp(24px,3vw,32px)] leading-tight font-extrabold tracking-[-0.02em]">
            {heading}
          </p>
          <p className="text-base leading-[1.55] text-muted">{summaryBody}</p>
        </div>
        <ul className="flex flex-wrap gap-2.5 text-sm font-bold">
          <li className="rounded-full border border-line-strong bg-surface px-4 py-2">{t('summary.screened', { count: screenedCount })}</li>
          {carriers.length ? (
            <li className="rounded-full bg-brand-tint px-4 py-2 text-brand-text-dark">{t('summary.carriers', { count: carriers.length })}</li>
          ) : null}
        </ul>
      </section>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[1fr_2fr]">
        <section aria-labelledby="findings-title" className="flex flex-col gap-3">
          <h2 id="findings-title" className="text-[15px] font-extrabold">
            {t('findings.title')}
          </h2>
          <ul data-testid="findings-list" className="flex flex-col gap-3">
            {findings.map((f) => {
              const on = f.id === selected?.id;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={t('findings.select', { condition: f.title })}
                    onClick={() => setSelectedId(f.id)}
                    className={cn(cardClasses, 'flex w-full cursor-pointer items-start justify-between gap-3 p-4 text-start', on ? 'border-2 border-brand' : 'hover:bg-brand-tint-soft')}
                  >
                    <span className="flex flex-col gap-1">
                      <span className="font-extrabold">{f.title}</span>
                      {f.unverified ? <span className="text-[12px] font-bold text-info-text">{t('fromPhotoShort')}</span> : null}
                      <span className="text-[13px] text-muted">
                        {f.gene ? t('findings.patternGene', { pattern: f.pattern, gene: f.gene }) : f.pattern}
                      </span>
                    </span>
                    <span className="flex-none rounded-full bg-brand-tint px-2.5 py-1 text-xs font-bold text-brand-text-dark">
                      {f.status === 'carrier' ? t('findings.carrier') : t('findings.affected')}
                    </span>
                  </button>
                </li>
              );
            })}
            <li className="rounded-card border border-dashed border-line-strong p-4">
              <p className="font-extrabold">{t('findings.everythingElse')}</p>
              <p className="mt-1 text-[13px] leading-normal text-muted">{t('findings.everythingElseBody')}</p>
            </li>
          </ul>
        </section>

        {selected ? (
          <section
            key={selected.id}
            aria-live="polite"
            className={cn(cardClasses, 'flex flex-col gap-5 p-[clamp(24px,4vw,36px)] motion-safe:animate-cross-fade')}
          >
            <ul className="flex flex-wrap gap-2 text-sm font-semibold">
              <li className="rounded-full border border-line px-3.5 py-1.5">{selected.pattern}</li>
              {selected.geneLabel ? (
                <li className="rounded-full border border-line px-3.5 py-1.5">{selected.geneLabel}</li>
              ) : null}
            </ul>
            <div className="flex flex-wrap items-start gap-5">
              <div className="flex min-w-[260px] flex-1 flex-col gap-3">
                <h2 className="font-display text-[clamp(22px,2.6vw,30px)] leading-tight font-extrabold tracking-[-0.02em]">{detailHeading(selected)}</h2>
                <p className="text-base leading-[1.6]">
                  {selected.status === 'affected' ? t('detail.affectedBody') : simple ? selected.simple : selected.explanation}
                </p>
              </div>
              {/* Colour is always paired with a label (design system). */}
              <div role="img" aria-label={t('detail.beadsLabel')} className="flex gap-6 rounded-tile bg-bg px-8 py-5">
                {(selected.status === 'affected' ? ['a', 'a'] : ['A', 'a']).map((copy, i) => (
                  <span key={i} className="flex flex-col items-center gap-2 text-xs font-bold">
                    <span
                      className={cn(
                        'flex size-16 items-center justify-center rounded-full text-2xl font-extrabold',
                        copy === 'A' ? 'bg-bead-typical text-ink' : 'bg-brand text-ink',
                      )}
                    >
                      {copy}
                    </span>
                    {copy === 'A' ? t('detail.typical') : t('detail.changed')}
                  </span>
                ))}
              </div>
            </div>

            {selected.status === 'carrier' ? (
              <>
                <h3 className="text-xl font-extrabold">{t('detail.notDiagnosis')}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-tile bg-bg p-4">
                    <p className="font-extrabold">{t('detail.you', { label: selected.carrierLabel })}</p>
                    <p className="mt-1 text-sm leading-normal text-muted">{selected.carrierShort}</p>
                  </div>
                  <div className="rounded-tile bg-bg p-4">
                    <p className="font-extrabold">{selected.diseaseLabel}</p>
                    <p className="mt-1 text-sm leading-normal text-muted">{selected.diseaseShort}</p>
                  </div>
                </div>
                <p className="text-[15px] leading-[1.6] text-muted">{t.rich('detail.sameGene', { b: bold })}</p>
              </>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Link href={simulatorHref(selected.id)} className={buttonClasses('ghost', 'md')}>
                {t('detail.inherited', { condition: selected.title })}
              </Link>
              <Link href={conditionGuideHref(selected.id)} className={buttonClasses('ghost', 'md')}>
                {t('detail.learn', { condition: selected.title })}
              </Link>
            </div>
          </section>
        ) : null}
      </div>

      <section aria-labelledby="teachback-title" className={cn(cardClasses, 'mt-6 flex flex-col gap-4 p-6')}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="teachback-title" className="text-xl font-extrabold">
            {t('teachback.title')}
          </h2>
          <span className="text-sm text-muted">{t('teachback.meta')}</span>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {(Object.keys(answerKey) as Q[]).map((q, i) => (
            <fieldset key={q} className="flex flex-col gap-2">
              <legend className="mb-2 font-bold">
                {i + 1}. {t(`teachback.${q}`)}
              </legend>
              {(['a', 'b'] as const).map((choice) => (
                <label
                  key={choice}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-input border border-line-strong bg-surface px-4 has-[:checked]:border-ink"
                >
                  <input
                    type="radio"
                    name={q}
                    checked={answers[q] === choice}
                    onChange={() => {
                      setAnswers((a) => ({ ...a, [q]: choice }));
                      setChecked(false);
                    }}
                    className="size-4 accent-ink"
                  />
                  {t(`teachback.${q}${choice}`)}
                </label>
              ))}
              {checked ? (
                <p role="status" className={cn('text-sm', answers[q] === answerKey[q] ? 'text-success-text' : 'text-brand-text-dark')}>
                  <strong>{answers[q] === answerKey[q] ? t('teachback.right') : t('teachback.notQuite')}</strong> {t(`teachback.${explanations[q]}`)}
                </p>
              ) : null}
            </fieldset>
          ))}
        </div>
        {needsAll ? (
          <p role="alert" className="text-sm font-semibold text-danger">
            {t('teachback.needsAll')}
          </p>
        ) : null}
        <button type="button" onClick={check} className={buttonClasses('dark', 'md', 'self-start')}>
          {t('teachback.check')}
        </button>
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Link href="/dashboard/counsellor" className={buttonClasses('primary', 'lg')}>
          {t('actions.counsellor')}
        </Link>
        <Link href="/dashboard/couple" className={buttonClasses('ghost', 'lg')}>
          {t('actions.couple')}
        </Link>
        <Link href="/dashboard/options" className={buttonClasses('ghost', 'lg')}>
          {t('actions.options')}
        </Link>
      </div>
    </main>
  );
}
