import 'server-only';
/**
 * "Save to my results" (task 12, section 4). Writes one screening_results
 * row per finding with source = 'scan' and verified = false, through
 * save_scanned_report() as the service role (users can't insert results
 * themselves). Stores only the interpretation, the lab, the date and the
 * condition text as written: never an image, a name, an ID or other text.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { dbStatus } from './status';
import type { ReportDetails, ResolvedFinding } from './types';

type Row = {
  condition_code: string;
  status: ReturnType<typeof dbStatus>;
  genotype: string | null;
  flagged: boolean;
  flag_reason: string | null;
  condition_text: string;
};

/** Rows for the database. Skipped findings aren't saved; unmatched ones are saved flagged. */
export function rowsFor(findings: ResolvedFinding[]): Row[] {
  const seen = new Set<string>();
  let unlisted = 0;
  const rows: Row[] = [];
  for (const f of findings) {
    if (f.skipped) continue;
    const code = f.conditionId ?? `unlisted_${++unlisted}`;
    // One row per condition on a report (unique constraint): keep the first.
    if (seen.has(code)) continue;
    seen.add(code);
    const status = dbStatus(f.status);
    const flagged = f.flag.flagged || status === 'uncertain' || status === 'affected';
    rows.push({
      condition_code: code,
      status,
      genotype: f.zygosity === 'unknown' ? null : f.zygosity,
      flagged,
      flag_reason: flagged ? (f.flag.flagged ? f.flag.reason : status === 'uncertain' ? 'vus' : 'affected') : null,
      condition_text: f.conditionText,
    });
  }
  return rows;
}

export async function saveScannedReport(userId: string, report: ReportDetails, findings: ResolvedFinding[]): Promise<string | null> {
  const rows = rowsFor(findings);
  if (rows.length === 0) return null;
  const { data, error } = await createAdminClient().rpc('save_scanned_report', {
    p_user: userId,
    p_report: { lab_name: report.labName, report_date: report.reportDate, findings: rows },
  });
  if (error) {
    console.warn('save_scanned_report failed', error.code);
    return null;
  }
  return data as string;
}
