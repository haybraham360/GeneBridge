/**
 * The pure part of resolving a finding: status mapping and flagging, given
 * catalogue facts. Shared by the server (lib/scan/resolve.ts, the source of
 * truth) and the check screen, which previews the same result as the
 * person corrects fields. The server always recomputes.
 */
import { flagFinding, type Flag, type FindingStatus } from '@/lib/genetics/flagging';
import type { InheritancePattern } from '@/lib/genetics/inheritance';
import type { Classification, ReportedResult, Zygosity } from './schema';
import { mapStatus } from './status';
import type { CheckedFinding, DraftFinding } from './types';

export type CatalogueFacts = { pattern: InheritancePattern | 'complex'; alwaysEscalate: boolean };

export type ResolveInput = {
  conditionId: string | null;
  zygosity: Zygosity;
  classification: Classification;
  reportedResult: ReportedResult;
  lowConfidenceUnconfirmed: boolean;
};

export function resolveOne(
  input: ResolveInput,
  facts: (id: string) => CatalogueFacts | null,
  carrierScreen: boolean,
): { status: FindingStatus; flag: Flag } {
  const known = input.conditionId ? facts(input.conditionId) : null;
  const pattern = known?.pattern ?? null;
  const mapped = mapStatus(
    { zygosity: input.zygosity, classification: input.classification, reported_result: input.reportedResult },
    pattern,
  );
  const flag = flagFinding({
    status: mapped.status,
    conflicting: mapped.conflicting,
    pattern,
    alwaysEscalate: known?.alwaysEscalate ?? false,
    matched: known !== null,
    lowConfidenceUnconfirmed: input.lowConfidenceUnconfirmed,
    carrierScreen,
  });
  return { status: mapped.status, flag };
}

/** How the check screen labels a finding: "Carrier", "Not detected" or "Needs a specialist". */
export function plainResult(status: FindingStatus, flagged: boolean): 'carrier' | 'not_detected' | 'specialist' {
  if (!flagged && status === 'carrier') return 'carrier';
  if (!flagged && status === 'not_detected') return 'not_detected';
  return 'specialist';
}

/** A draft as the person first sees it, with nothing corrected. */
export function asChecked(findings: DraftFinding[]): CheckedFinding[] {
  return findings.map((f) => ({
    key: f.key,
    conditionText: f.conditionText,
    gene: f.gene,
    zygosity: f.zygosity,
    classification: f.classification,
    reportedResult: f.reportedResult,
    conditionId: f.conditionId,
    lowConfidence: f.lowConfidence,
    confirmed: false,
    skipped: false,
  }));
}
