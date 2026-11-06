/**
 * Scan analytics events (task 12, section 9). Counts and categories only:
 * never image content, names, extracted text or which conditions were
 * found.
 */
import type { EntryPoint, ScanFailure } from './types';
import type { ReportType } from './schema';

export type ScanEvent =
  | { name: 'scan_started'; props: { entry: EntryPoint } }
  | { name: 'scan_pages'; props: { count: number } }
  | { name: 'scan_completed'; props: { seconds: number; findings: number; flagged: number; report_type: ReportType } }
  | { name: 'scan_field_corrected'; props: { count: number } }
  | { name: 'scan_saved'; props?: undefined }
  | { name: 'scan_failed'; props: { reason: ScanFailure | 'blurry' | 'camera_denied' } }
  | { name: 'scan_audio_played'; props: { locale: 'ar' | 'en' } };

/** Events the browser may log itself (through /api/scan/event). */
export const clientEventNames = ['scan_field_corrected', 'scan_audio_played', 'scan_failed'] as const;
const clientFailures = new Set(['blurry', 'camera_denied', 'cancelled', 'file_type', 'file_too_large', 'too_many_pages']);

/** Checks a browser event; returns it only if every prop is allowed. */
export function parseClientEvent(value: unknown): ScanEvent | null {
  if (!value || typeof value !== 'object') return null;
  const { name, props } = value as { name?: unknown; props?: Record<string, unknown> };
  if (name === 'scan_field_corrected') {
    const count = Number(props?.count);
    return Number.isInteger(count) && count >= 0 && count <= 60 ? { name, props: { count } } : null;
  }
  if (name === 'scan_audio_played') {
    return props?.locale === 'ar' || props?.locale === 'en' ? { name, props: { locale: props.locale } } : null;
  }
  if (name === 'scan_failed') {
    const reason = props?.reason;
    return typeof reason === 'string' && clientFailures.has(reason)
      ? { name, props: { reason: reason as ScanFailure | 'blurry' | 'camera_denied' } }
      : null;
  }
  return null;
}
