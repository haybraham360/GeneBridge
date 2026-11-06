'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import type { InheritancePattern } from '@/lib/genetics/inheritance';
import { asChecked } from '@/lib/scan/resolveCore';
import type { CheckedReport, EntryPoint, Explanation, ScanDraft, ScanFailure, ScanLocale, ScanStep } from '@/lib/scan/types';
import { CaptureStep } from './CaptureStep';
import { CheckStep } from './CheckStep';
import { ExplainStep } from './ExplainStep';
import { ReadingStep } from './ReadingStep';
import { logScanEvent, readReport, releasePage, ScanFailed, uploadPages, type Page } from './scanClient';

export type CatalogueOption = {
  id: string;
  title: string;
  gene: string | null;
  pattern: InheritancePattern | 'complex';
  alwaysEscalate: boolean;
};

type Props = {
  entry: EntryPoint;
  initialLanguage: ScanLocale;
  autoListen: boolean;
  ready: boolean;
  catalogue: CatalogueOption[];
};

type Stage = 'capture' | 'reading' | 'check' | 'explain';

const backHref: Record<EntryPoint, string> = {
  onboarding: '/onboarding',
  results: '/dashboard/results',
  home: '/dashboard',
  assistant: '/dashboard/assistant',
  direct: '/dashboard',
};

/**
 * Photograph your report, hear it explained (task 12): capture → reading →
 * check what we found → your explanation. Nothing is kept unless the person
 * saves it; leaving at any point stores nothing.
 */
export function ScanFlow({ entry, initialLanguage, autoListen, ready, catalogue }: Props) {
  const t = useTranslations('scan');
  const [stage, setStage] = useState<Stage>('capture');
  const [language, setLanguage] = useState<ScanLocale>(initialLanguage);
  const [pages, setPages] = useState<Page[]>([]);
  const [step, setStep] = useState<ScanStep>('reading');
  const [failure, setFailure] = useState<ScanFailure | null>(null);
  const [draft, setDraft] = useState<ScanDraft | null>(null);
  const [checked, setChecked] = useState<CheckedReport | null>(null);
  const [corrections, setCorrections] = useState(0);
  const [ownReport, setOwnReport] = useState(false);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const abort = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const pagesRef = useRef(pages);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  // Object URLs for thumbnails are released when the flow closes.
  useEffect(() => () => pagesRef.current.forEach(releasePage), []);

  // Move focus to the new screen's heading for keyboard and screen reader users.
  useEffect(() => {
    heading.current?.focus();
  }, [stage]);

  const start = useCallback(async () => {
    if (pages.length === 0) return;
    setFailure(null);
    setStep('reading');
    setStage('reading');
    const controller = new AbortController();
    abort.current = controller;
    try {
      const paths = await uploadPages(pages);
      if (controller.signal.aborted) throw new ScanFailed('cancelled');
      const result = await readReport(paths, pages.map((p) => p.name), entry, controller.signal, { onStep: setStep });
      setDraft(result);
      setChecked({ locale: language, report: result.report, findings: asChecked(result.findings) });
      setCorrections(0);
      setOwnReport(false);
      setStage('check');
    } catch (error) {
      const code: ScanFailure = controller.signal.aborted ? 'cancelled' : error instanceof ScanFailed ? error.code : 'failed';
      setFailure(code);
      setStage('capture');
    } finally {
      abort.current = null;
    }
  }, [pages, entry, language]);

  const cancel = useCallback(() => {
    abort.current?.abort();
  }, []);

  const reset = useCallback(() => {
    pagesRef.current.forEach(releasePage);
    setPages([]);
    setDraft(null);
    setChecked(null);
    setExplanation(null);
    setFailure(null);
    setStage('capture');
  }, []);

  const explain = useCallback(
    async (report: CheckedReport, own: boolean): Promise<boolean> => {
      const response = await fetch(`/api/scan/explain?corrected=${corrections}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...report, locale: language }),
      }).catch(() => null);
      if (!response?.ok) return false;
      setChecked({ ...report, locale: language });
      setOwnReport(own);
      setExplanation((await response.json()) as Explanation);
      setStage('explain');
      return true;
    },
    [corrections, language],
  );

  const changeLanguage = useCallback((next: ScanLocale) => setLanguage(next), []);

  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-auto px-[clamp(16px,3vw,40px)] pt-9 pb-10">
      <div className="mb-4">
        <Link href={backHref[entry]} className="text-sm font-bold text-brand-text underline-offset-4 hover:underline">
          {t(`back.${entry}`)}
        </Link>
      </div>

      {stage === 'capture' ? (
        <CaptureStep
          headingRef={heading}
          pages={pages}
          onPagesChange={setPages}
          language={language}
          onLanguageChange={changeLanguage}
          ready={ready}
          failure={failure}
          onStart={() => void start()}
        />
      ) : null}

      {stage === 'reading' ? <ReadingStep headingRef={heading} step={step} onCancel={cancel} /> : null}

      {stage === 'check' && draft && checked ? (
        <CheckStep
          headingRef={heading}
          draft={draft}
          report={checked}
          onReportChange={setChecked}
          onCorrected={() => setCorrections((n) => n + 1)}
          catalogue={catalogue}
          onExplain={explain}
          onRescan={reset}
        />
      ) : null}

      {stage === 'explain' && explanation && checked ? (
        <ExplainStep
          headingRef={heading}
          explanation={explanation}
          report={checked}
          ownReport={ownReport}
          autoListen={autoListen}
          onScanAnother={reset}
          onAudioPlayed={() => logScanEvent('scan_audio_played', { locale: explanation.locale })}
        />
      ) : null}
    </main>
  );
}
