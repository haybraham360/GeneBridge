import type { EquityOverall, EquityRow, Figure } from './types';

/** A language is flagged when it is more than this many points below the overall figure. */
export const EQUITY_GAP_POINTS = 5;

function below(value: Figure, overall: Figure): boolean {
  return value !== null && overall !== null && overall - value > EQUITY_GAP_POINTS;
}

/**
 * Which measures put a language row under review: understanding gain or
 * counselling uptake more than 5 points below the overall average. Hidden
 * figures are never flagged (there is nothing to compare).
 */
export function equityFlags(row: EquityRow, overall: EquityOverall) {
  const gain = below(row.gain, overall.gain);
  const uptake = below(row.uptakePct, overall.uptakePct);
  return { gain, uptake, any: gain || uptake };
}
