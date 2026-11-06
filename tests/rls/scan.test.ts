/**
 * Report scanner privacy (task 12, section 10): after a scan the bucket is
 * empty, uploads are owner-only, and nothing saved holds a name, ID number,
 * date of birth or image. Runs the real pipeline against Supabase with the
 * model replaced by the sample's correct reading (no AI calls).
 *
 * Needs 20261107000000_report_scanner.sql applied, `npm run seed:auth` and
 * `npm run samples:generate`. Skipped without them.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminClient, hasSupabase, signedInAs } from '../supabase';

vi.mock('server-only', () => ({}));

const samplePath = 'samples/reports/mariam-report.pdf';

async function bucketExists(): Promise<boolean> {
  if (!hasSupabase) return false;
  const { data } = await adminClient().storage.getBucket('scan-uploads');
  return Boolean(data);
}

const ready = hasSupabase && existsSync(samplePath) && (await bucketExists());

describe.skipIf(!ready)('Privacy: report scanner', () => {
  let mariam: SupabaseClient;
  let mariamId: string;
  let khalid: SupabaseClient;

  const cleanUp = async () => {
    await adminClient().from('screening_results').delete().eq('owner_id', mariamId).eq('source', 'scan');
    const { data } = await adminClient().storage.from('scan-uploads').list(mariamId);
    if (data?.length) await adminClient().storage.from('scan-uploads').remove(data.map((f) => `${mariamId}/${f.name}`));
  };

  beforeAll(async () => {
    ({ client: mariam, userId: mariamId } = await signedInAs('mariam'));
    ({ client: khalid } = await signedInAs('khalid'));
    await cleanUp();
  }, 60_000);

  afterAll(cleanUp);

  it('uploads are owner-only', async () => {
    const path = `${mariamId}/${randomUUID()}`;
    const up = await mariam.storage.from('scan-uploads').upload(path, readFileSync(samplePath), { contentType: 'application/pdf' });
    expect(up.error).toBeNull();
    const peek = await khalid.storage.from('scan-uploads').download(path);
    expect(peek.data).toBeNull();
    const intoOther = await khalid.storage.from('scan-uploads').upload(`${mariamId}/${randomUUID()}`, Buffer.from('%PDF-1.4'), { contentType: 'application/pdf' });
    expect(intoOther.error).not.toBeNull();
    await mariam.storage.from('scan-uploads').remove([path]);
  });

  it('after a scan the bucket is empty, and nothing saved holds a name, ID or image', async () => {
    const { runScan } = await import('@/lib/scan/pipeline');
    const { goldenExtraction, samples } = await import('@/lib/scan/samples');
    const { resolveChecked } = await import('@/lib/scan/resolve');
    const { asChecked } = await import('@/lib/scan/resolveCore');
    const { saveScannedReport } = await import('@/lib/scan/save');
    const sample = samples.find((s) => s.file === 'mariam-report.pdf')!;

    const path = `${mariamId}/${randomUUID()}`;
    await mariam.storage.from('scan-uploads').upload(path, readFileSync(samplePath), { contentType: 'application/pdf' });

    let pagesSeen = 0;
    const draft = await runScan({
      supabase: mariam,
      paths: [path],
      extractor: async (pages) => {
        pagesSeen = pages.length;
        // The page reaching the model has no document metadata.
        expect(pages[0].data.includes(Buffer.from(sample.patient.name))).toBe(false);
        return goldenExtraction(sample);
      },
    });
    expect(pagesSeen).toBe(1);

    // The upload is gone straight after reading.
    const { data: left } = await adminClient().storage.from('scan-uploads').list(mariamId);
    expect(left ?? []).toHaveLength(0);

    // The draft and the saved rows carry no name, ID number or date of birth.
    const secrets = [sample.patient.name, ...sample.patient.name.split(' '), sample.patient.idNumber, sample.patient.dob];
    const draftText = JSON.stringify(draft);
    for (const s of secrets) expect(draftText).not.toContain(s);

    const reference = await saveScannedReport(mariamId, draft.report, resolveChecked(asChecked(draft.findings), draft.report.reportType));
    expect(reference).toMatch(/^SCAN-/);
    const { data: rows } = await adminClient().from('screening_results').select('*').eq('owner_id', mariamId).eq('source', 'scan');
    expect(rows?.length).toBe(sample.rows.length);
    const saved = JSON.stringify(rows);
    for (const s of secrets) expect(saved).not.toContain(s);
    for (const row of rows ?? []) {
      expect(row.verified).toBe(false);
      // Only interpretation columns; no image, name or free text beyond the condition as written.
      expect(Object.keys(row).filter((k) => /image|photo|name|dob|birth|emirates|national/i.test(k))).toEqual([]);
    }
  }, 60_000);
});
