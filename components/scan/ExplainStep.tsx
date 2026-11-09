'use client';

import { CircleCheck, Info, MessageCircle, ShieldCheck, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type RefObject } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { assistantContext, SCAN_CONTEXT_KEY } from '@/lib/scan/assistantContext';
import { spokenSentences } from '@/lib/scan/spoken';
import type { CheckedReport, ExplainedFinding, Explanation } from '@/lib/scan/types';
import { Narrator, WithLtr } from './Narrator';

type Props = {
  headingRef: RefObject<HTMLHeadingElement | null>;
  explanation: Explanation;
  report: CheckedReport;
  ownReport: boolean;
  autoListen: boolean;
  onScanAnother: () => void;
  onAudioPlayed: () => void;
};

/**
 * "Your explanation" (task 12): the /results layout (summary, findings list,
 * selected finding's detail), read aloud with captions. Everything comes
 * from the catalogue. Flagged findings show only the specialist card, with
 * no explanation and no numbers. Nothing is kept unless the person saves.
 */
export function ExplainStep({ headingRef, explanation, report, ownReport, autoListen, onScanAnother, onAudioPlayed }: Props) {
  const t = useTranslations('scan');
  const router = useRouter();
  const [simple, setSimple] = useState(false);
  const listed = explanation.findings.filter((f) => f.kind !== 'not_detected');
  const clear = explanation.findings.filter((f) => f.kind === 'not_detected');
  const [selectedKey, setSelectedKey] = useState<string | null>(listed[0]?.key ?? null);
  const [save, setSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const selected = listed.find((f) => f.key === selectedKey) ?? listed[0] ?? null;
  const locale = explanation.locale;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  // What's read aloud: the summary, then the selected finding (if it has an explanation).
  const spokenKey = selected?.sentences.length ? selected.key : '__none__';
  const spoken = spokenSentences(explanation, simple, spokenKey);

  const summary = simple ? explanation.summarySimple : explanation.summary;
  const canSave = ownReport && explanation.reportFlag !== 'unreadable' && explanation.findings.length > 0;

  const saveReport = async () => {
    setSave('saving');
    const response = await fetch('/api/scan/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report, ownReport: true }),
    }).catch(() => null);
    setSave(response?.ok ? 'saved' : 'error');
  };

  const ask = () => {
    try {
      sessionStorage.setItem(SCAN_CONTEXT_KEY, assistantContext(explanation));
    } catch {
      // Private mode: the chat opens without the report.
    }
    router.push('/dashboard/assistant?report=scan');
  };

  return (
    <section aria-labelledby="explain-title" className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 id="explain-title" ref={headingRef} tabIndex={-1} className="text-[32px] leading-tight font-extrabold tracking-[-0.02em] outline-none">
            {t('explain.title')}
          </h1>
          <p className="inline-flex w-fit items-center gap-2 rounded-full bg-info-tint px-3.5 py-1.5 text-[13px] font-bold text-info-text" data-testid="unverified-label">
            <Info aria-hidden="true" className="size-4" strokeWidth={2} />
            {t('unverified')}
          </p>
        </div>
        {!explanation.reportFlag ? (
          <label className={buttonClasses('ghost', 'md', 'cursor-pointer')}>
            <input type="checkbox" checked={simple} onChange={(e) => setSimple(e.target.checked)} className="size-4 accent-ink" />
            {t('explain.simpler')}
          </label>
        ) : null}
      </header>

      <section lang={locale} dir={dir} className={cn(cardClasses, 'flex flex-col gap-3 p-[clamp(24px,4vw,36px)]')} aria-label={t('explain.summaryHeading')}>
        <p data-testid="scan-summary" className="text-[clamp(22px,3vw,30px)] leading-tight font-extrabold tracking-[-0.02em]">
          {summary[0] ? <WithLtr text={summary[0]} /> : null}
        </p>
        {summary.slice(1).map((s, i) => (
          <p key={i} className="text-base leading-[1.55] text-muted">
            <WithLtr text={s} />
          </p>
        ))}
        <div dir={locale === 'ar' ? 'rtl' : 'ltr'} className="mt-2">
          <Narrator key={`${simple}-${selected?.key ?? ''}`} sentences={spoken} locale={locale} autoPlay={autoListen} onPlayed={onAudioPlayed} />
        </div>
      </section>

      {explanation.reportFlag ? (
        <SpecialistCard />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_2fr]">
          <section aria-labelledby="scan-findings-title" className="flex flex-col gap-3">
            <h2 id="scan-findings-title" className="text-[15px] font-extrabold">
              {t('explain.findingsTitle')}
            </h2>
            <ul data-testid="scan-findings" className="flex flex-col gap-3">
              {listed.map((f) => {
                const on = f.key === selected?.key;
                return (
                  <li key={f.key}>
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={t('explain.select', { condition: f.title })}
                      onClick={() => setSelectedKey(f.key)}
                      data-testid="scan-finding"
                      data-kind={f.kind}
                      className={cn(cardClasses, 'flex w-full cursor-pointer items-start justify-between gap-3 p-4 text-start', on ? 'border-2 border-brand' : 'hover:bg-brand-tint-soft')}
                    >
                      <span className="flex flex-col gap-1">
                        <span className="font-extrabold">{f.title}</span>
                        {f.pattern ? (
                          <span className="text-[13px] text-muted">
                            {f.gene ? t.rich('explain.patternGene', { pattern: f.pattern, gene: f.gene, g: (c) => <bdi dir="ltr">{c}</bdi> }) : f.pattern}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          'flex-none rounded-full px-2.5 py-1 text-xs font-bold',
                          f.kind === 'carrier' ? 'bg-brand-tint text-brand-text-dark' : 'bg-info-tint text-info-text',
                        )}
                      >
                        {f.kind === 'carrier' ? t('explain.carrier') : t('explain.specialist')}
                      </span>
                    </button>
                  </li>
                );
              })}
              {clear.length > 0 ? (
                <li className="rounded-card border border-dashed border-line-strong p-4" data-testid="not-detected">
                  <p className="font-extrabold">{t('explain.notDetectedTitle')}</p>
                  <p className="mt-1 text-[13px] font-semibold">{clear.map((f) => f.title).join(' · ')}</p>
                  <p className="mt-1 text-[13px] leading-normal text-muted">{t('explain.notDetectedBody')}</p>
                </li>
              ) : null}
            </ul>
          </section>

          {selected ? <FindingDetail key={selected.key} finding={selected} simple={simple} locale={locale} /> : null}
        </div>
      )}

      <section className={cn(cardClasses, 'flex flex-col gap-4 p-6')}>
        {save === 'saved' ? (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-tile bg-success-tint p-4 text-success-text">
            <CircleCheck aria-hidden="true" className="size-5 flex-none" strokeWidth={2} />
            <p className="flex-1 text-[15px] font-bold">{t('explain.saved')}</p>
            <Link href="/dashboard/results" className={buttonClasses('dark', 'md')}>
              {t('explain.viewResults')}
            </Link>
          </div>
        ) : null}
        {save === 'error' ? (
          <p role="alert" className="text-sm font-semibold text-danger">
            {t('explain.saveError')}
          </p>
        ) : null}
        {!ownReport ? <p className="text-sm text-muted">{t('explain.cantSave')}</p> : null}

        <div className="flex flex-wrap gap-3">
          {canSave && save !== 'saved' ? (
            <button
              type="button"
              onClick={() => void saveReport()}
              disabled={save === 'saving'}
              className={buttonClasses('primary', 'lg', 'disabled:opacity-60')}
            >
              {save === 'saving' ? t('explain.saving') : t('explain.save')}
            </button>
          ) : null}
          <button type="button" onClick={ask} className={buttonClasses('ghost', 'lg')}>
            <MessageCircle aria-hidden="true" className="size-5" strokeWidth={2} />
            {t('explain.ask')}
          </button>
          <Link href="/dashboard/counsellor" className={buttonClasses('ghost', 'lg')}>
            <UserRound aria-hidden="true" className="size-5" strokeWidth={2} />
            {t('explain.counsellor')}
          </Link>
          <button type="button" onClick={onScanAnother} className={buttonClasses('ghost', 'lg')}>
            {t('explain.scanAnother')}
          </button>
        </div>
        {save !== 'saved' ? (
          <p className="flex items-start gap-2 text-sm text-muted">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 flex-none text-success-text" strokeWidth={2} />
            {t('explain.leaveNote')}
          </p>
        ) : null}
      </section>
    </section>
  );
}

function SpecialistCard({ unmatched = false }: { unmatched?: boolean }) {
  const t = useTranslations('scan');
  return (
    <section data-testid="specialist-card" className={cn(cardClasses, 'flex flex-col gap-3 border-2 border-info-text/20 p-[clamp(24px,4vw,36px)]')}>
      <h2 className="font-display text-[clamp(20px,2.4vw,26px)] leading-tight font-extrabold tracking-[-0.02em]">{t('explain.specialistTitle')}</h2>
      <p className="text-base leading-[1.6] text-muted">{unmatched ? t('check.unmatched') : t('explain.specialistBody')}</p>
      <Link href="/dashboard/counsellor" className={buttonClasses('primary', 'lg', 'self-start')}>
        {t('explain.book')}
      </Link>
    </section>
  );
}

function FindingDetail({ finding, simple, locale }: { finding: ExplainedFinding; simple: boolean; locale: 'ar' | 'en' }) {
  const t = useTranslations('scan.explain');
  // Flagged or unmatched: the specialist card only. No explanation, no numbers.
  if (finding.kind !== 'carrier') return <SpecialistCard unmatched={finding.kind === 'unmatched'} />;
  const text = simple ? finding.simple : finding.sentences;
  return (
    <section
      aria-live="polite"
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      data-testid="scan-detail"
      className={cn(cardClasses, 'flex flex-col gap-5 p-[clamp(24px,4vw,36px)] motion-safe:animate-cross-fade')}
    >
      <ul className="flex flex-wrap gap-2 text-sm font-semibold">
        {finding.pattern ? <li className="rounded-full border border-line px-3.5 py-1.5">{finding.pattern}</li> : null}
        {finding.gene ? (
          <li className="rounded-full border border-line px-3.5 py-1.5">
            <bdi dir="ltr">{finding.gene}</bdi>
          </li>
        ) : null}
      </ul>
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-[260px] flex-1 flex-col gap-3">
          <h2 className="font-display text-[clamp(22px,2.6vw,30px)] leading-tight font-extrabold tracking-[-0.02em]">
            <WithLtr text={text[0] ?? finding.title} />
          </h2>
          {text.slice(1).map((s, i) => (
            <p key={i} className="text-base leading-[1.6]">
              <WithLtr text={s} />
            </p>
          ))}
        </div>
        {/* Colour is always paired with a label (design system). */}
        <div role="img" aria-label={t('beadsLabel')} className="flex gap-6 rounded-tile bg-bg px-8 py-5">
          {(['A', 'a'] as const).map((copy) => (
            <span key={copy} className="flex flex-col items-center gap-2 text-xs font-bold">
              <span className={cn('flex size-16 items-center justify-center rounded-full text-2xl font-extrabold text-ink', copy === 'A' ? 'bg-bead-typical' : 'bg-brand')}>
                {copy}
              </span>
              {copy === 'A' ? t('typical') : t('changed')}
            </span>
          ))}
        </div>
      </div>
      <h3 className="text-xl font-extrabold">{t('notDiagnosis')}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-tile bg-bg p-4">
          <p className="font-extrabold">{t('you', { label: finding.carrierLabel ?? finding.title })}</p>
          {finding.carrierShort ? <p className="mt-1 text-sm leading-normal text-muted">{finding.carrierShort}</p> : null}
        </div>
        <div className="rounded-tile bg-bg p-4">
          <p className="font-extrabold">{finding.diseaseLabel ?? finding.title}</p>
          {finding.diseaseShort ? <p className="mt-1 text-sm leading-normal text-muted">{finding.diseaseShort}</p> : null}
        </div>
      </div>
    </section>
  );
}
