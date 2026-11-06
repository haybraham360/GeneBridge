/**
 * Reads a photographed or uploaded screening report (task 12). POST JSON:
 *
 *   { "paths": ["<user_id>/<uuid>", ...], "names": ["mariam-report.pdf", ...],
 *     "entry": "results" }
 *
 * The browser has already uploaded each page to the private scan-uploads
 * bucket (owner-only). The reply is a server-sent event stream:
 *
 *   event: step   data: {"step":"reading"|"finding"|"checking"|"preparing"}
 *   event: draft  data: { ScanDraft }      what was read, for the person to check
 *   event: error  data: {"code": ScanFailure}
 *
 * Cancelling the request aborts the model call. The uploads are deleted as
 * soon as reading finishes or fails. Nothing is saved. Logs counts and
 * categories only.
 */
import { logEvents } from '@/lib/auth/events';
import { extractionAvailable } from '@/lib/scan/extract';
import { MAX_PAGES } from '@/lib/scan/images';
import { runScan, ScanError } from '@/lib/scan/pipeline';
import { isOwnUploadPath, removeUploads, sweepExpired } from '@/lib/scan/storage';
import { testExtraction, testExtractorEnabled } from '@/lib/scan/testExtractor';
import { entryPoints, type EntryPoint, type ScanFailure } from '@/lib/scan/types';
import type { ScanEvent } from '@/lib/scan/events';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DAILY_LIMIT = 10;

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ code: 'signed_out' }, 401);

  const body = (await request.json().catch(() => ({}))) as { paths?: unknown; names?: unknown; entry?: unknown };
  const rawPaths = Array.isArray(body.paths) ? body.paths : [];
  const paths = rawPaths.filter((p): p is string => isOwnUploadPath(p, user.id));
  const names = (Array.isArray(body.names) ? body.names : []).filter((n): n is string => typeof n === 'string').slice(0, MAX_PAGES);
  const entry: EntryPoint = entryPoints.includes(body.entry as EntryPoint) ? (body.entry as EntryPoint) : 'direct';

  const fail = async (code: ScanFailure, status: number) => {
    await removeUploads(supabase, paths);
    await logEvents(supabase, user.id, [{ name: 'scan_failed', props: { reason: code } }]);
    return json({ code }, status);
  };

  if (paths.length !== rawPaths.length) return fail('failed', 400);
  if (paths.length === 0) return fail('no_files', 400);
  if (paths.length > MAX_PAGES) return fail('too_many_pages', 400);

  const useTestExtractor = testExtractorEnabled();
  if (!useTestExtractor && !extractionAvailable()) return fail('ai_unavailable', 503);

  const { data: used, error: limitError } = await supabase.rpc('scans_last_day');
  if (limitError) return fail('failed', 503);
  if ((used as number) >= DAILY_LIMIT) return fail('rate_limited', 429);

  await logEvents(supabase, user.id, [
    { name: 'scan_started', props: { entry } },
    { name: 'scan_pages', props: { count: paths.length } },
  ] satisfies ScanEvent[]);

  // Belt and braces: clear anyone's uploads older than 15 minutes.
  void sweepExpired(createAdminClient()).catch(() => {});

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (event: string, data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          open = false;
        }
      };
      try {
        const draft = await runScan({
          supabase,
          paths,
          signal: request.signal,
          startedAt,
          onStep: (step) => send('step', { step }),
          extractor: useTestExtractor ? async () => testExtraction(names) : undefined,
        });
        await logEvents(supabase, user.id, [
          {
            name: 'scan_completed',
            props: {
              seconds: draft.seconds,
              findings: draft.findings.length,
              flagged: draft.findings.filter((f) => f.flag.flagged).length,
              report_type: draft.report.reportType,
            },
          },
        ] satisfies ScanEvent[]);
        send('draft', draft);
      } catch (error) {
        const reason: ScanFailure = request.signal.aborted ? 'cancelled' : error instanceof ScanError ? error.reason : 'failed';
        if (!(error instanceof ScanError)) console.warn('scan failed', error instanceof Error ? error.name : 'unknown');
        await logEvents(supabase, user.id, [{ name: 'scan_failed', props: { reason } }]);
        send('error', { code: reason });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          // Already closed by a cancelled request.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
