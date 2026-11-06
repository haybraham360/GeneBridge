/**
 * "Looks right, explain it" (task 12). POST the checked report; returns the
 * explanation built from the condition catalogue, in the chosen language.
 * Statuses and flags are worked out again here from what the person
 * confirmed: flagged findings come back with no explanation. Nothing is
 * stored.
 */
import { logEvents } from '@/lib/auth/events';
import { buildExplanation } from '@/lib/scan/explain';
import { resolveChecked } from '@/lib/scan/resolve';
import { smoothExplanation, smoothingEnabled } from '@/lib/scan/smooth';
import { parseCheckedReport } from '@/lib/scan/validate';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ code: 'signed_out' }, { status: 401 });

  const checked = parseCheckedReport(await request.json().catch(() => null));
  if (!checked) return Response.json({ code: 'invalid' }, { status: 400 });

  const resolved = resolveChecked(checked.findings, checked.report.reportType);
  let explanation = buildExplanation(resolved, checked.report.reportType, checked.locale);
  if (smoothingEnabled() && !explanation.reportFlag) explanation = await smoothExplanation(explanation);

  const corrected = Number(new URL(request.url).searchParams.get('corrected') ?? 0);
  if (Number.isInteger(corrected) && corrected > 0 && corrected <= 60) {
    await logEvents(supabase, user.id, [{ name: 'scan_field_corrected', props: { count: corrected } }]);
  }

  return Response.json(explanation, { headers: { 'Cache-Control': 'no-store' } });
}
