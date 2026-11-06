/**
 * Shapes passed between the scan screens and the server (task 12). The
 * browser never decides a status or a flag: every request that explains or
 * saves re-runs matching, status mapping and flagging on the server
 * (lib/scan/resolve.ts).
 */
import type { Flag, FindingStatus } from '@/lib/genetics/flagging';
import type { Classification, ReportType, ReportedResult, Zygosity } from './schema';
import type { MatchMethod } from './match';

export type ScanLocale = 'ar' | 'en';

export const scanSteps = ['reading', 'finding', 'checking', 'preparing'] as const;
export type ScanStep = (typeof scanSteps)[number];

export const entryPoints = ['onboarding', 'results', 'home', 'assistant', 'direct'] as const;
export type EntryPoint = (typeof entryPoints)[number];

/** Why a scan failed, as a category (logged as scan_failed; never content). */
export type ScanFailure =
  | 'signed_out'
  | 'rate_limited'
  | 'no_files'
  | 'too_many_pages'
  | 'file_type'
  | 'file_too_large'
  | 'unreadable'
  | 'ai_unavailable'
  | 'cancelled'
  | 'failed';

/** Report details the person can check and edit. Never a name or ID. */
export type ReportDetails = {
  reportType: ReportType;
  labName: string | null;
  reportDate: string | null;
  panelName: string | null;
  screenedCount: number | null;
};

/** One finding as read, ready for the person to check. */
export type DraftFinding = {
  key: string;
  /** Exactly as written on the report. */
  conditionText: string;
  gene: string | null;
  zygosity: Zygosity;
  classification: Classification;
  reportedResult: ReportedResult;
  confidence: number;
  lowConfidence: boolean;
  /** The deterministic match; a suggestion needs the person's confirmation. */
  conditionId: string | null;
  matchMethod: MatchMethod | null;
  suggestion: string | null;
  status: FindingStatus;
  flag: Flag;
};

export type ScanDraft = {
  report: ReportDetails;
  /** The report language as detected; the explanation uses the person's choice. */
  languageDetected: 'ar' | 'en' | 'mixed';
  namePresent: boolean;
  findings: DraftFinding[];
  /** Seconds from upload to this draft, for scan_completed. */
  seconds: number;
};

/** What the browser sends back after the person checked the findings. */
export type CheckedFinding = {
  key: string;
  conditionText: string;
  gene: string | null;
  zygosity: Zygosity;
  classification: Classification;
  reportedResult: ReportedResult;
  conditionId: string | null;
  lowConfidence: boolean;
  /** The person looked at a low-confidence field or suggestion and confirmed or corrected it. */
  confirmed: boolean;
  skipped: boolean;
};

export type CheckedReport = {
  locale: ScanLocale;
  report: ReportDetails;
  findings: CheckedFinding[];
};

/** A finding after the server re-checked it. */
export type ResolvedFinding = {
  key: string;
  conditionText: string;
  conditionId: string | null;
  gene: string | null;
  zygosity: Zygosity;
  status: FindingStatus;
  flag: Flag;
  skipped: boolean;
};

export type ExplainedFinding = {
  key: string;
  conditionId: string | null;
  /** Catalogue title in the explanation language, or the text as written. */
  title: string;
  gene: string | null;
  asWritten: string;
  kind: 'carrier' | 'not_detected' | 'specialist' | 'unmatched';
  /** "Autosomal recessive" etc., from the catalogue; null when not matched. */
  pattern: string | null;
  /** Empty for anything flagged: never explained. */
  sentences: string[];
  simple: string[];
  carrierLabel: string | null;
  diseaseLabel: string | null;
  carrierShort: string | null;
  diseaseShort: string | null;
};

export type Explanation = {
  locale: ScanLocale;
  summary: string[];
  summarySimple: string[];
  findings: ExplainedFinding[];
  counts: { carrier: number; notDetected: number; flagged: number; skipped: number };
  /** Set when the whole report is routed to a counsellor. */
  reportFlag: 'other_report' | 'unreadable' | null;
  /** Did the model smooth the wording (after passing the output check)? */
  smoothed: boolean;
};
