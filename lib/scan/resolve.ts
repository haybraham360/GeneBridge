/**
 * Turns findings (as read, or as checked by the person) into statuses and
 * flags. Runs on the server for every draft, explanation and save, so the
 * browser can't skip a flag (guardrail 4).
 */
import { getEntry } from '@/lib/assistant/library';
import { catalogueIds, matchCondition } from './match';
import { resolveOne, type CatalogueFacts } from './resolveCore';
import { CONFIDENCE_THRESHOLD, type Extraction, type ReportType } from './schema';
import type { CheckedFinding, DraftFinding, ResolvedFinding } from './types';

/** Inheritance pattern and escalation for a catalogue condition. */
export function catalogueFacts(conditionId: string): CatalogueFacts | null {
  const entry = getEntry(conditionId, 'en');
  if (!entry || entry.kind !== 'condition') return null;
  return { pattern: entry.inheritance ?? 'complex', alwaysEscalate: entry.always_escalate === true };
}

export function isCarrierScreen(type: ReportType): boolean {
  return type === 'carrier_screening';
}

/** Steps 4 to 6 for a fresh extraction: match, map, flag. */
export function draftFindings(extraction: Extraction): DraftFinding[] {
  const carrierScreen = isCarrierScreen(extraction.report_type);
  return extraction.findings.map((f, i) => {
    const match = matchCondition({ condition_text: f.condition_text, gene: f.gene });
    const lowConfidence = f.confidence < CONFIDENCE_THRESHOLD;
    const zygosity = f.zygosity ?? 'unknown';
    const classification = f.classification ?? 'unknown';
    const { status, flag } = resolveOne(
      { conditionId: match.conditionId, zygosity, classification, reportedResult: f.reported_result, lowConfidenceUnconfirmed: lowConfidence },
      catalogueFacts,
      carrierScreen,
    );
    return {
      key: `f${i + 1}`,
      conditionText: f.condition_text.trim().slice(0, 200),
      gene: f.gene?.trim().slice(0, 32) || null,
      zygosity,
      classification,
      reportedResult: f.reported_result,
      confidence: f.confidence,
      lowConfidence,
      conditionId: match.conditionId,
      matchMethod: match.method,
      suggestion: match.suggestion,
      status,
      flag,
    };
  });
}

/**
 * Re-checks findings the person confirmed. A condition the person picked
 * must be a catalogue id; a low-confidence finding they didn't confirm stays
 * flagged; a condition other than the deterministic match (a suggestion, or
 * their own pick) only counts once they confirmed it.
 */
export function resolveChecked(findings: CheckedFinding[], reportType: ReportType): ResolvedFinding[] {
  const ids = new Set(catalogueIds());
  const carrierScreen = isCarrierScreen(reportType);
  return findings.map((f) => {
    const picked = f.conditionId && ids.has(f.conditionId) ? f.conditionId : null;
    const deterministic = matchCondition({ condition_text: f.conditionText, gene: f.gene }).conditionId;
    const conditionId = picked && (picked === deterministic || f.confirmed) ? picked : null;
    const { status, flag } = resolveOne(
      {
        conditionId,
        zygosity: f.zygosity,
        classification: f.classification,
        reportedResult: f.reportedResult,
        lowConfidenceUnconfirmed: f.lowConfidence && !f.confirmed,
      },
      catalogueFacts,
      carrierScreen,
    );
    return {
      key: f.key,
      conditionText: f.conditionText.slice(0, 200),
      conditionId,
      gene: f.gene?.slice(0, 32) || null,
      zygosity: f.zygosity,
      status,
      flag,
      skipped: f.skipped,
    };
  });
}

export { asChecked } from './resolveCore';
