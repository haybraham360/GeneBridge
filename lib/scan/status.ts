/**
 * Maps what a report says to a finding status (task 12, section 3 step 5).
 * Deterministic: zygosity × inheritance pattern × classification × the
 * result as written. Never infers a result the report doesn't state.
 *
 * - heterozygous pathogenic / likely pathogenic, recessive → carrier
 * - homozygous or hemizygous, or any change for a dominant or X-linked
 *   condition → affected (always flagged)
 * - uncertain → uncertain (flagged)
 * - not detected → not_detected
 * - contradictions or nothing readable → unknown (flagged)
 */
import type { FindingStatus } from '@/lib/genetics/flagging';
import type { InheritancePattern } from '@/lib/genetics/inheritance';
import type { Classification, ReportedResult, Zygosity } from './schema';

export type StatusInput = {
  zygosity?: Zygosity;
  classification?: Classification;
  reported_result: ReportedResult;
};

export type MappedStatus = { status: FindingStatus; conflicting: boolean };

const pathogenic = (c?: Classification) => c === 'pathogenic' || c === 'likely_pathogenic';
const benign = (c?: Classification) => c === 'benign' || c === 'likely_benign';

export function mapStatus(input: StatusInput, pattern: InheritancePattern | 'complex' | null): MappedStatus {
  const { zygosity = 'unknown', classification = 'unknown', reported_result: result } = input;
  const conflict: MappedStatus = { status: 'unknown', conflicting: true };

  if (classification === 'uncertain' || result === 'uncertain') return { status: 'uncertain', conflicting: false };

  if (benign(classification)) {
    return result === 'carrier' || result === 'affected' ? conflict : { status: 'not_detected', conflicting: false };
  }
  if (result === 'not_detected') {
    return pathogenic(classification) ? conflict : { status: 'not_detected', conflicting: false };
  }

  // From here the report states a change (a result of carrier or affected,
  // or a pathogenic classification).
  const changeStated = result === 'carrier' || result === 'affected' || pathogenic(classification);
  if (!changeStated) return { status: 'unknown', conflicting: false };

  if (result === 'carrier' && (zygosity === 'homozygous' || zygosity === 'hemizygous')) return conflict;
  if (result === 'affected' || zygosity === 'homozygous' || zygosity === 'hemizygous') {
    return { status: 'affected', conflicting: false };
  }
  if (pattern === 'autosomal_dominant' || pattern === 'x_linked') return { status: 'affected', conflicting: false };

  // Recessive (or not in the catalogue, which is flagged anyway). The lab
  // must have said "carrier", or reported one pathogenic copy.
  if (result === 'carrier' || (zygosity === 'heterozygous' && pathogenic(classification))) {
    return { status: 'carrier', conflicting: false };
  }
  return { status: 'unknown', conflicting: false };
}

/** The database's status words (screening_results.status). */
export function dbStatus(status: FindingStatus): 'carrier' | 'affected' | 'no_variant' | 'uncertain' {
  if (status === 'not_detected') return 'no_variant';
  if (status === 'unknown') return 'uncertain';
  return status;
}
