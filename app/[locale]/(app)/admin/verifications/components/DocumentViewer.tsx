'use client';

import { ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { cardClasses } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

/**
 * One document's pages, zoomable. Served decrypted by /api/kyc/document to
 * admins only, never cached; each view is audited.
 */
export function DocumentViewer({ title, urls, mirror = false }: { title: string; urls: string[]; mirror?: boolean }) {
  const t = useTranslations('admin.review');
  const [zoom, setZoom] = useState(1);
  return (
    <section className={cn(cardClasses, 'flex min-w-0 flex-col gap-3 p-4')}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-extrabold">{title}</h3>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
            disabled={zoom <= 1}
            aria-label={t('zoomOut', { title })}
            className="flex size-11 cursor-pointer items-center justify-center rounded-full border border-line disabled:opacity-40"
          >
            <ZoomOut aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
            disabled={zoom >= 4}
            aria-label={t('zoomIn', { title })}
            className="flex size-11 cursor-pointer items-center justify-center rounded-full border border-line disabled:opacity-40"
          >
            <ZoomIn aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
      {urls.map((url, i) => (
        <div key={url} className="max-h-[520px] overflow-auto rounded-tile border border-line bg-bg">
          <object
            data={url}
            aria-label={t('page', { title, n: i + 1 })}
            className={cn('block w-full origin-top-left', mirror && '-scale-x-100')}
            style={{ width: `${zoom * 100}%`, minHeight: 320 }}
          >
            <a href={url} target="_blank" rel="noreferrer" className="block p-4 text-sm font-semibold text-brand-text">
              {t('openPage', { n: i + 1 })}
            </a>
          </object>
        </div>
      ))}
    </section>
  );
}
