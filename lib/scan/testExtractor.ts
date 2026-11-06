import 'server-only';
/**
 * A stand-in for the model, for automated tests only. When
 * SCAN_TEST_EXTRACTOR=1 and NODE_ENV is not "production", uploads named
 * like a sample report (samples/reports/) return that sample's correct
 * reading, so the Playwright tests don't depend on the AI service. Anything
 * else reads as unreadable. Never active in production.
 */
import { goldenExtraction, sampleByFile } from './samples';
import type { Extraction } from './schema';

export function testExtractorEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.SCAN_TEST_EXTRACTOR === '1';
}

export function testExtraction(fileNames: string[]): Extraction {
  const sample = fileNames.map(sampleByFile).find(Boolean);
  return sample
    ? goldenExtraction(sample)
    : { report_type: 'unreadable', language_detected: 'en', findings: [], name_on_report_present: false, warnings: [] };
}
