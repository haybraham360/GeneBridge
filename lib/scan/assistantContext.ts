/**
 * "Ask a question about this report" (task 12): the minimal summary Ask
 * GeneBridge gets, for this browser session only. Only findings that were
 * explained (carrier, not detected) are named. Flagged findings are never
 * shared with the model (PROJECT.md section 8): only that some exist.
 * Model-facing data, not patient-facing copy.
 */
import type { Explanation } from './types';

export const SCAN_CONTEXT_KEY = 'genebridge.scanReport';

export function assistantContext(explanation: Explanation): string {
  const lines = ['Report the user photographed (not yet confirmed by their screening centre).'];
  if (explanation.reportFlag) {
    lines.push('This report needs a counsellor to explain it. Do not interpret it.');
    return lines.join('\n');
  }
  const carriers = explanation.findings.filter((f) => f.kind === 'carrier');
  const clear = explanation.findings.filter((f) => f.kind === 'not_detected');
  if (carriers.length) lines.push(`Carrier: ${carriers.map((f) => `${f.conditionId}${f.gene ? ` (${f.gene})` : ''}`).join(', ')}.`);
  if (clear.length) lines.push(`Not detected: ${clear.map((f) => f.conditionId).join(', ')}.`);
  if (explanation.counts.flagged > 0) {
    lines.push('Some other findings need a specialist; they are not shared here. Offer a counsellor for them.');
  }
  return lines.join('\n');
}
