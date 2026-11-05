/**
 * Guardrail 12: while the synthetic seed is in use, every figure on the
 * dashboard (and in its export) is labelled "Synthetic demo data".
 * Controlled by one flag: NEXT_PUBLIC_DEMO_DATA=true.
 */
export function isDemoData(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_DATA === 'true';
}
