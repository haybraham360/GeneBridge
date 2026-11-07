'use client';

import { Camera, FileText, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useId, useState } from 'react';
import { CameraView } from '@/components/scan/CameraView';
import { pageFromFile, PageProblem, releasePage, type Page } from '@/components/scan/scanClient';
import { buttonClasses } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export type Captured = Page & { label?: string };

type Props = {
  pages: Captured[];
  onChange: (pages: Captured[]) => void;
  maxPages: number;
  allowPdf?: boolean;
  facing?: 'environment' | 'user';
  /** Labels per slot, e.g. ["Front", "Back"] for an ID. */
  slotLabels?: string[];
  hint: string;
};

/**
 * Camera or upload for one document (task 14), reusing the task 12 capture
 * pieces: the on-screen frame, the blur and darkness check, several pages,
 * and re-encoding in the browser (which drops EXIF data; the server
 * re-encodes again). Camera permission is asked only after a tap, with
 * upload as the fallback.
 */
export function DocumentCapture({ pages, onChange, maxPages, allowPdf = false, facing = 'environment', slotLabels, hint }: Props) {
  const t = useTranslations('verify.capture');
  const [camera, setCamera] = useState(false);
  const [denied, setDenied] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [warning, setWarning] = useState<{ id: string; kind: 'blurry' | 'dark' } | null>(null);
  const inputId = useId();
  const full = pages.length >= maxPages;

  const add = useCallback(
    async (blob: Blob, name: string) => {
      setProblem(null);
      try {
        const page = await pageFromFile(blob, name);
        if (page.kind === 'pdf' && !allowPdf) {
          releasePage(page);
          setProblem('file_type');
          return;
        }
        onChange([...pages, page].slice(0, maxPages));
        if (page.quality?.blurry || page.quality?.dark) setWarning({ id: page.id, kind: page.quality.blurry ? 'blurry' : 'dark' });
      } catch (error) {
        setProblem(error instanceof PageProblem ? error.reason : 'unreadable');
      }
    },
    [allowPdf, maxPages, onChange, pages],
  );

  const remove = (id: string) => {
    const page = pages.find((p) => p.id === id);
    if (page) releasePage(page);
    onChange(pages.filter((p) => p.id !== id));
    if (warning?.id === id) setWarning(null);
  };

  const onDenied = useCallback(() => {
    setCamera(false);
    setDenied(true);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] text-muted">{hint}</p>

      {pages.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {pages.map((p, i) => (
            <li key={p.id} className="relative overflow-hidden rounded-tile border border-line bg-bg">
              {p.preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local object URL, never uploaded unencrypted
                <img src={p.preview} alt={t('pageAlt', { n: i + 1 })} className={cn('aspect-4/3 w-full object-cover', facing === 'user' && '-scale-x-100')} />
              ) : (
                <div className="flex aspect-4/3 flex-col items-center justify-center gap-2 p-3 text-center text-sm">
                  <FileText aria-hidden="true" className="size-6 text-muted" />
                  <span className="line-clamp-2 break-all">{p.name}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 p-2 text-sm font-semibold">
                <span>{slotLabels?.[i] ?? t('page', { n: i + 1 })}</span>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  aria-label={t('remove', { label: slotLabels?.[i] ?? t('page', { n: i + 1 }) })}
                  className="flex size-11 cursor-pointer items-center justify-center rounded-full hover:bg-surface"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {warning ? (
        <div role="alert" className="flex flex-col gap-3 rounded-tile border border-brand bg-brand-tint-soft p-4">
          <p className="text-[15px] font-semibold">{t(`quality.${warning.kind}`)}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => remove(warning.id)} className={buttonClasses('dark', 'sm')}>
              {t('quality.retake')}
            </button>
            <button type="button" onClick={() => setWarning(null)} className={buttonClasses('ghost', 'sm')}>
              {t('quality.keep')}
            </button>
          </div>
        </div>
      ) : null}

      {camera ? (
        <CameraView
          facing={facing}
          hint={facing === 'user' ? t('selfieHint') : t('frameHint')}
          onDenied={onDenied}
          onClose={() => setCamera(false)}
          onCapture={(blob) => {
            setCamera(false);
            void add(blob, facing === 'user' ? 'selfie.jpg' : `photo-${pages.length + 1}.jpg`);
          }}
        />
      ) : !full ? (
        <div className="flex flex-wrap gap-3">
          {!denied ? (
            <button type="button" onClick={() => setCamera(true)} className={buttonClasses('dark', 'md')}>
              <Camera aria-hidden="true" className="size-5" />
              {slotLabels?.[pages.length] ? t('takeSlot', { label: slotLabels[pages.length] }) : t('take')}
            </button>
          ) : null}
          <label htmlFor={inputId} className={buttonClasses('ghost', 'md', 'cursor-pointer has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-ring')}>
            <Upload aria-hidden="true" className="size-5" />
            {t('upload')}
            <input
              id={inputId}
              type="file"
              className="sr-only"
              accept={allowPdf ? 'image/jpeg,image/png,application/pdf,.pdf' : 'image/jpeg,image/png'}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void add(file, file.name);
              }}
            />
          </label>
        </div>
      ) : (
        <p className="text-sm text-muted">{t('full')}</p>
      )}

      {denied ? <p className="text-sm text-muted">{t('cameraDenied')}</p> : null}
      {problem ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {t(`problems.${problem}` as 'problems.unreadable')}
        </p>
      ) : null}
    </div>
  );
}
