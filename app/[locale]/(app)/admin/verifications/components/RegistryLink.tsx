'use client';

import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { logRegistryOpened } from '../actions';

/** The official licence lookup, in a new tab (never scraped). Unset until the source is confirmed. */
export function RegistryLink({ submissionId, url, note }: { submissionId: string; url: string | null; note: string }) {
  const t = useTranslations('admin.review');
  if (!url) {
    return (
      <p data-testid="registry-note" className="rounded-tile bg-bg p-3 text-sm text-muted">
        {note}
      </p>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => void logRegistryOpened(submissionId).catch(() => undefined)}
      className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-text underline"
    >
      <ExternalLink aria-hidden="true" className="size-4" />
      {t('registry')}
    </a>
  );
}
