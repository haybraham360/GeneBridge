/**
 * Validates what the browser sends back after the person checked their
 * findings. Bounded strings and enums only: nothing free-form beyond the
 * condition text as written.
 */
import { z } from 'zod';
import { classifications, reportTypes, reportedResults, zygosities } from './schema';
import type { CheckedReport } from './types';

const text = (max: number) => z.string().trim().max(max);

const checkedFinding = z.object({
  key: z.string().regex(/^f\d{1,3}$/),
  conditionText: text(200).min(1),
  gene: text(32).nullable(),
  zygosity: z.enum(zygosities),
  classification: z.enum(classifications),
  reportedResult: z.enum(reportedResults),
  conditionId: z.string().max(64).nullable(),
  lowConfidence: z.boolean(),
  confirmed: z.boolean(),
  skipped: z.boolean(),
});

export const checkedReportSchema = z.object({
  locale: z.enum(['ar', 'en']),
  report: z.object({
    reportType: z.enum(reportTypes),
    labName: text(120).nullable(),
    reportDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    panelName: text(120).nullable(),
    screenedCount: z.number().int().min(0).max(5000).nullable(),
  }),
  findings: z.array(checkedFinding).max(60),
});

export function parseCheckedReport(value: unknown): CheckedReport | null {
  const parsed = checkedReportSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
