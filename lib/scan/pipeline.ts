import 'server-only';
/**
 * The scan pipeline (task 12, section 3), server only:
 *   1. upload: the browser has already put each page in the private
 *      scan-uploads bucket under the user's own folder;
 *   2. extract: download, check, clean (no metadata) and read with Claude;
 *   3. delete the uploads straight away, whether reading worked or not;
 *   4–6. match to the catalogue, map to a status, flag;
 * then hand a draft back for the person to check. Nothing is saved here.
 *
 * Logs no image content, names or extracted text.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { extractWithClaude, type Extractor } from './extract';
import { MAX_PAGES, PageError, preparePage, type PreparedPage } from './images';
import { draftFindings } from './resolve';
import { downloadUpload, removeUploads } from './storage';
import type { ScanDraft, ScanFailure, ScanStep } from './types';

export class ScanError extends Error {
  constructor(readonly reason: ScanFailure) {
    super(reason);
  }
}

export type ScanInput = {
  supabase: SupabaseClient;
  /** Paths already checked with isOwnUploadPath. */
  paths: string[];
  signal?: AbortSignal;
  onStep?: (step: ScanStep) => void;
  extractor?: Extractor;
  startedAt?: number;
};

export async function runScan({ supabase, paths, signal, onStep, extractor = extractWithClaude, startedAt = Date.now() }: ScanInput): Promise<ScanDraft> {
  if (paths.length === 0) throw new ScanError('no_files');
  if (paths.length > MAX_PAGES) throw new ScanError('too_many_pages');

  onStep?.('reading');
  let extraction;
  try {
    const pages: PreparedPage[] = [];
    for (const path of paths) {
      if (signal?.aborted) throw new ScanError('cancelled');
      const raw = await downloadUpload(supabase, path);
      if (!raw) throw new ScanError('failed');
      try {
        pages.push(await preparePage(raw));
      } catch (error) {
        throw new ScanError(error instanceof PageError ? error.reason : 'failed');
      }
    }
    if (signal?.aborted) throw new ScanError('cancelled');
    try {
      extraction = await extractor(pages, signal);
    } catch (error) {
      if (signal?.aborted) throw new ScanError('cancelled');
      throw error instanceof ScanError ? error : new ScanError('failed');
    }
  } finally {
    // Step 3: the images are never kept. The 15-minute sweep catches a failed delete.
    await removeUploads(supabase, paths);
  }
  if (!extraction) throw new ScanError('unreadable');

  onStep?.('finding');
  const findings = draftFindings(extraction);
  onStep?.('checking');
  onStep?.('preparing');

  return {
    report: {
      reportType: extraction.report_type,
      labName: extraction.lab_name?.slice(0, 120) || null,
      reportDate: /^\d{4}-\d{2}-\d{2}$/.test(extraction.report_date ?? '') ? (extraction.report_date as string) : null,
      panelName: extraction.panel_name?.slice(0, 120) || null,
      screenedCount: extraction.conditions_screened_count ?? null,
    },
    languageDetected: extraction.language_detected,
    namePresent: extraction.name_on_report_present,
    findings,
    seconds: Math.round((Date.now() - startedAt) / 100) / 10,
  };
}
