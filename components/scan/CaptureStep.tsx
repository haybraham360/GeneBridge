'use client';

import { ArrowDown, ArrowUp, Camera, FileText, Languages, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useId, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import type { ScanFailure, ScanLocale } from '@/lib/scan/types';
import { CameraView } from './CameraView';
import { ACCEPT, MAX_PAGES, logScanEvent, pageFromFile, PageProblem, releasePage, type Page } from './scanClient';

type Props = {
  headingRef: RefObject<HTMLHeadingElement | null>;
  pages: Page[];
  onPagesChange: (pages: Page[]) => void;
  language: ScanLocale;
  onLanguageChange: (locale: ScanLocale) => void;
  ready: boolean;
  failure: ScanFailure | null;
  onStart: () => void;
};

type AddProblem = PageProblem['reason'] | 'max_pages';

const noSubscribe = () => () => {};

export function CaptureStep({ headingRef, pages, onPagesChange, language, onLanguageChange, ready, failure, onStart }: Props) {
  const t = useTranslations('scan');
  const [camera, setCamera] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [problem, setProblem] = useState<AddProblem | null>(null);
  const [busy, setBusy] = useState(false);
  /** The page just added looked blurry or dark: ask before keeping it. */
  const [warning, setWarning] = useState<{ id: string; kind: 'blurry' | 'dark'; fromCamera: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadButton = useRef<HTMLLabelElement>(null);
  const inputId = useId();

  // True once React is running in the browser: before that, a picked file would be missed.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const full = pages.length >= MAX_PAGES;

  const add = useCallback(
    async (files: { blob: Blob; name: string }[], fromCamera: boolean) => {
      setProblem(null);
      setBusy(true);
      let next = [...pages];
      try {
        for (const file of files) {
          if (next.length >= MAX_PAGES) {
            setProblem('max_pages');
            break;
          }
          try {
            const page = await pageFromFile(file.blob, file.name);
            next = [...next, page];
            if (page.quality?.blurry || page.quality?.dark) {
              setWarning({ id: page.id, kind: page.quality.blurry ? 'blurry' : 'dark', fromCamera });
              logScanEvent('scan_failed', { reason: 'blurry' });
            }
          } catch (error) {
            const reason = error instanceof PageProblem ? error.reason : 'unreadable';
            setProblem(reason);
            if (reason === 'file_type' || reason === 'file_too_large') logScanEvent('scan_failed', { reason });
          }
        }
      } finally {
        onPagesChange(next);
        setBusy(false);
      }
    },
    [pages, onPagesChange],
  );

  const remove = (id: string) => {
    const page = pages.find((p) => p.id === id);
    if (page) releasePage(page);
    onPagesChange(pages.filter((p) => p.id !== id));
    if (warning?.id === id) setWarning(null);
  };

  const move = (index: number, by: -1 | 1) => {
    const next = [...pages];
    const [page] = next.splice(index, 1);
    next.splice(index + by, 0, page);
    onPagesChange(next);
  };

  const retake = () => {
    if (!warning) return;
    const fromCamera = warning.fromCamera;
    remove(warning.id);
    setWarning(null);
    if (fromCamera) setCamera(true);
    else fileInput.current?.click();
  };

  const denied = useCallback(() => {
    setCamera(false);
    setCameraDenied(true);
    logScanEvent('scan_failed', { reason: 'camera_denied' });
    requestAnimationFrame(() => uploadButton.current?.focus());
  }, []);

  const other: ScanLocale = language === 'ar' ? 'en' : 'ar';

  return (
    <section aria-labelledby="scan-title" data-hydrated={hydrated || undefined} className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 id="scan-title" ref={headingRef} tabIndex={-1} className="text-[32px] leading-tight font-extrabold tracking-[-0.02em] outline-none">
            {t('title')}
          </h1>
          <p className="max-w-xl text-[15px] leading-[1.6] text-muted">{t('subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => onLanguageChange(other)}
          aria-label={`${t('language.label', { language: t(`language.${language}`) })}. ${t('language.change')}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-bold hover:bg-brand-tint-soft"
          data-testid="language-chip"
        >
          <Languages aria-hidden="true" className="size-4 text-brand-text" strokeWidth={2} />
          {t('language.label', { language: t(`language.${language}`) })}
        </button>
      </header>

      {!ready ? (
        <div role="status" className="flex flex-col gap-3 rounded-card border border-line bg-brand-tint-soft p-5">
          <p className="text-[15px] leading-[1.6]">{t('capture.aiUnavailable')}</p>
          <Link href="/dashboard?addResult=1" className={buttonClasses('dark', 'md', 'self-start')}>
            {t('capture.useReference')}
          </Link>
        </div>
      ) : null}

      {failure ? (
        <div role="alert" data-testid="scan-failed" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
          <p className="text-lg font-extrabold">{failure === 'cancelled' ? t('failed.cancelled') : t('failed.title')}</p>
          {failure !== 'cancelled' ? <p className="text-[15px] leading-[1.6] text-muted">{t(`failed.${failure}`)}</p> : null}
          {failure === 'unreadable' ? (
            <Link href="/dashboard/counsellor" className={buttonClasses('ghost', 'md', 'self-start')}>
              {t('failed.counsellor')}
            </Link>
          ) : null}
        </div>
      ) : null}

      {cameraDenied ? (
        <p role="alert" className="rounded-tile bg-brand-tint p-4 text-[15px] font-semibold text-brand-text-dark">
          {t('capture.cameraDenied')}
        </p>
      ) : null}

      {camera ? (
        <CameraView
          onCapture={(blob) => {
            setCamera(false);
            void add([{ blob, name: `photo-${pages.length + 1}.jpg` }], true);
          }}
          onClose={() => setCamera(false)}
          onDenied={denied}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {pages.length > 0 ? <h2 className="text-[15px] font-extrabold">{t('capture.addPage')}</h2> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {!cameraDenied ? (
              <button
                type="button"
                disabled={!ready || full || busy}
                onClick={() => {
                  setProblem(null);
                  setCamera(true);
                }}
                className={cn(cardClasses, 'flex min-h-35 cursor-pointer flex-col items-start gap-2 p-6 text-start hover:bg-brand-tint-soft disabled:cursor-not-allowed disabled:opacity-60')}
              >
                <Camera aria-hidden="true" className="size-8 text-brand-text" strokeWidth={2} />
                <span className="text-lg font-extrabold">{t('capture.takePhoto')}</span>
                <span className="text-sm text-muted">{t('capture.takePhotoHint')}</span>
              </button>
            ) : null}
            <label
              ref={uploadButton}
              htmlFor={inputId}
              tabIndex={ready && !full ? 0 : -1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInput.current?.click();
                }
              }}
              aria-disabled={!ready || full || busy}
              className={cn(
                cardClasses,
                'flex min-h-35 cursor-pointer flex-col items-start gap-2 p-6 hover:bg-brand-tint-soft',
                (!ready || full || busy) && 'pointer-events-none opacity-60',
              )}
            >
              <Upload aria-hidden="true" className="size-8 text-brand-text" strokeWidth={2} />
              <span className="text-lg font-extrabold">{t('capture.upload')}</span>
              <span className="text-sm text-muted">{t('capture.uploadHint')}</span>
            </label>
            <input
              ref={fileInput}
              id={inputId}
              data-testid="scan-file-input"
              type="file"
              accept={ACCEPT}
              multiple
              disabled={!ready || full || busy}
              className="sr-only"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []).map((f) => ({ blob: f, name: f.name }));
                e.target.value = '';
                if (files.length) void add(files, false);
              }}
            />
          </div>
        </div>
      )}

      {busy ? (
        <p role="status" className="text-sm text-muted">
          {t('capture.preparing')}
        </p>
      ) : null}
      {problem ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {problem === 'max_pages' ? t('capture.maxPages') : t(`capture.errors.${problem}`)}
        </p>
      ) : null}

      {warning ? (
        <div role="alert" data-testid="quality-warning" className="flex flex-col gap-3 rounded-card border border-line bg-brand-tint p-5">
          <p className="text-[15px] font-bold text-brand-text-dark">{t(`capture.${warning.kind}`)}</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={retake} className={buttonClasses('dark', 'md')}>
              {t('capture.retake')}
            </button>
            <button type="button" onClick={() => setWarning(null)} className={buttonClasses('ghost', 'md')}>
              {t('capture.keep')}
            </button>
          </div>
        </div>
      ) : null}

      {pages.length > 0 ? (
        <section aria-labelledby="pages-title" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="pages-title" className="text-[15px] font-extrabold">
              {t('capture.pagesTitle')}
            </h2>
            <span className="text-sm text-muted">{t('capture.pagesCount', { count: pages.length })}</span>
          </div>
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5" data-testid="scan-pages">
            {pages.map((page, i) => {
              const number = i + 1;
              return (
                <li key={page.id} className={cn(cardClasses, 'flex flex-col gap-2 p-2')}>
                  <div className="flex aspect-3/4 items-center justify-center overflow-hidden rounded-tile bg-bg">
                    {page.preview ? (
                      // Object URL of the cleaned photo; nothing leaves the device until "Read my report".
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={page.preview} alt={t('capture.page', { number })} className="size-full object-cover" />
                    ) : (
                      <span className="flex flex-col items-center gap-1 text-xs font-bold text-muted">
                        <FileText aria-hidden="true" className="size-8" strokeWidth={2} />
                        {t('capture.pdf')}
                      </span>
                    )}
                  </div>
                  <p className="text-center text-xs font-bold">{t('capture.page', { number })}</p>
                  <div className="flex justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label={t('capture.earlier', { number })}
                      className="flex size-11 items-center justify-center rounded-full border border-line hover:bg-brand-tint-soft disabled:opacity-40"
                    >
                      <ArrowUp aria-hidden="true" className="size-4" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === pages.length - 1}
                      aria-label={t('capture.later', { number })}
                      className="flex size-11 items-center justify-center rounded-full border border-line hover:bg-brand-tint-soft disabled:opacity-40"
                    >
                      <ArrowDown aria-hidden="true" className="size-4" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(page.id)}
                      aria-label={t('capture.remove', { number })}
                      className="flex size-11 items-center justify-center rounded-full border border-line text-danger hover:bg-brand-tint-soft"
                    >
                      <Trash2 aria-hidden="true" className="size-4" strokeWidth={2} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <p className="flex items-start gap-2 text-sm leading-normal text-muted">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 flex-none text-success-text" strokeWidth={2} />
        {t('privacy')}
      </p>

      <button
        type="button"
        onClick={onStart}
        disabled={!ready || pages.length === 0 || busy || Boolean(warning)}
        className={buttonClasses('primary', 'lg', 'self-start disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none')}
      >
        {t('capture.read')}
      </button>
    </section>
  );
}
