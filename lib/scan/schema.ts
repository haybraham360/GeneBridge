/**
 * What the extraction model must return (task 12, section 3). Validated
 * with zod before anything else touches it. The model is told never to
 * return the patient's name, ID number or date of birth: there is no field
 * for them, only whether a name was present.
 */
import { z } from 'zod';

export const reportTypes = ['carrier_screening', 'diagnostic', 'prenatal', 'newborn', 'other', 'unreadable'] as const;
export const zygosities = ['heterozygous', 'homozygous', 'hemizygous', 'unknown'] as const;
export const classifications = ['pathogenic', 'likely_pathogenic', 'uncertain', 'likely_benign', 'benign', 'unknown'] as const;
export const reportedResults = ['carrier', 'affected', 'not_detected', 'uncertain', 'unknown'] as const;

export type ReportType = (typeof reportTypes)[number];
export type Zygosity = (typeof zygosities)[number];
export type Classification = (typeof classifications)[number];
export type ReportedResult = (typeof reportedResults)[number];

export const extractedFindingSchema = z.object({
  /** Exactly as written on the report. */
  condition_text: z.string(),
  gene: z.string().optional(),
  variant: z.string().optional(),
  zygosity: z.enum(zygosities).optional(),
  classification: z.enum(classifications).optional(),
  reported_result: z.enum(reportedResults),
  /** 0 to 1. */
  confidence: z.number().min(0).max(1),
});

export const extractionSchema = z.object({
  report_type: z.enum(reportTypes),
  lab_name: z.string().optional(),
  report_date: z.string().optional(),
  panel_name: z.string().optional(),
  conditions_screened_count: z.number().int().min(0).max(5000).optional(),
  language_detected: z.enum(['ar', 'en', 'mixed']),
  findings: z.array(extractedFindingSchema).max(60),
  /** Whether a person's name appears on the report. Never the name itself. */
  name_on_report_present: z.boolean(),
  warnings: z.array(z.string()).max(20),
});

export type ExtractedFinding = z.infer<typeof extractedFindingSchema>;
export type Extraction = z.infer<typeof extractionSchema>;

/** Under this, a field is shown as "We couldn't read this clearly". */
export const CONFIDENCE_THRESHOLD = 0.8;
