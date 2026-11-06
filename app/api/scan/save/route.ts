/**
 * "Save to my results" (task 12, section 4). POST:
 *   { "report": CheckedReport, "ownReport": true }
 *
 * Only a report the person ticked as their own is saved (someone else's can
 * be explained, never saved to this person's results). Statuses and flags
 * are worked out again from the confirmed findings; rows are saved with
 * source = 'scan' and verified = false.
 */
import { logEvents } from '@/lib/auth/events';
import { resolveChecked } from '@/lib/scan/resolve';
import { saveScannedReport } from '@/lib/scan/save';
import { parseCheckedReport } from '@/lib/scan/validate';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ code: 'signed_out' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { report?: unknown; ownReport?: unknown };
  if (body.ownReport !== true) return Response.json({ code: 'not_own' }, { status: 403 });
  const checked = parseCheckedReport(body.report);
  if (!checked) return Response.json({ code: 'invalid' }, { status: 400 });

  const resolved = resolveChecked(checked.findings, checked.report.reportType);
  const reference = await saveScannedReport(user.id, checked.report, resolved);
  if (!reference) return Response.json({ code: 'failed' }, { status: 500 });

  await logEvents(supabase, user.id, [{ name: 'scan_saved' }]);
  return Response.json({ saved: true }, { headers: { 'Cache-Control': 'no-store' } });
}
