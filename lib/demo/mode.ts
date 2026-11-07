/**
 * Demo mode (task 15, section 1). Off by default: GeneBridge runs with real
 * people. When off, every demo helper is hidden:
 *   - the UAE PASS test identities (lib/auth/uaePass.ts);
 *   - the family-notice demo links shown after sending (dev-only);
 *   - the "Synthetic demo data" labels, unless synthetic analytics data
 *     actually exists (lib/analytics/demo.ts, guardrail 12).
 *
 * One switch, readable on the server and in the browser:
 * NEXT_PUBLIC_DEMO_MODE=true.
 */
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}
