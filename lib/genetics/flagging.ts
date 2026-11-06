/**
 * Flagging (task 10 rules, written down once here; task 12 uses them for
 * scanned reports). A flagged finding is never explained: the person sees
 * only the counsellor handoff, with no explanation and no numbers
 * (guardrail 4).
 *
 * A finding is flagged when it is:
 * - uncertain (a variant of uncertain significance) or conflicting;
 * - "affected" (two changed copies, or one for a dominant condition);
 * - for a dominant, X-linked or complex-pattern condition, or one marked
 *   `always_escalate` in the catalogue, with any change found;
 * - unreadable, or read with low confidence and not checked by the person;
 * - not in the condition catalogue;
 * - on a report that isn't a carrier screen.
 */
import type { InheritancePattern } from './inheritance';

export const flagReasons = [
  'vus',
  'severe',
  'x_linked',
  'conflicting',
  'affected',
  'dominant',
  'unreadable',
  'unmatched',
  'other_report',
] as const;
export type FlagReason = (typeof flagReasons)[number];

/** A finding's status after mapping (lib/scan/status.ts). */
export type FindingStatus = 'carrier' | 'affected' | 'not_detected' | 'uncertain' | 'unknown';

export type FlagInput = {
  status: FindingStatus;
  /** Did the status come from contradictory report text (e.g. "benign" and "carrier")? */
  conflicting?: boolean;
  /** The catalogue pattern; null when the condition isn't in the catalogue. */
  pattern: InheritancePattern | 'complex' | null;
  alwaysEscalate?: boolean;
  /** Matched to a catalogue entry (and, for a suggestion, confirmed by the person). */
  matched: boolean;
  /** Read with confidence under 0.8 and not checked or corrected by the person. */
  lowConfidenceUnconfirmed?: boolean;
  /** False when the whole report isn't a carrier screen. */
  carrierScreen?: boolean;
};

export type Flag = { flagged: false; reason: null } | { flagged: true; reason: FlagReason };

const ok: Flag = { flagged: false, reason: null };
const flag = (reason: FlagReason): Flag => ({ flagged: true, reason });

/** The first rule that applies wins; the order puts the most specific reason first. */
export function flagFinding(input: FlagInput): Flag {
  if (input.carrierScreen === false) return flag('other_report');
  if (!input.matched) return flag('unmatched');
  if (input.conflicting) return flag('conflicting');
  if (input.status === 'uncertain') return flag('vus');
  if (input.status === 'unknown') return flag('unreadable');
  if (input.lowConfidenceUnconfirmed) return flag('unreadable');
  if (input.status === 'not_detected') return ok;

  // A change was found.
  if (input.pattern === 'x_linked') return flag('x_linked');
  if (input.pattern === 'autosomal_dominant') return flag('dominant');
  if (input.status === 'affected') return flag('affected');
  if (input.pattern === 'complex' || input.pattern === null || input.alwaysEscalate) return flag('severe');
  return ok;
}

export function isFlagReason(value: unknown): value is FlagReason {
  return typeof value === 'string' && (flagReasons as readonly string[]).includes(value);
}
