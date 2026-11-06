/**
 * Photograph your report, hear it explained (task 12).
 *
 * Needs Supabase env vars, all migrations (including
 * 20261107000000_report_scanner.sql), `npm run seed:auth`,
 * `npm run samples:generate`, and the dev server started with
 * SCAN_TEST_EXTRACTOR=1 so sample files are read without the AI service:
 *
 *   SCAN_TEST_EXTRACTOR=1 npx playwright test scan
 *
 * (Stop any dev server already running without it: Playwright reuses it.)
 * Uses Patient L. (English) and Patient S. (Arabic), who have no screening
 * result; scanned rows are removed afterwards.
 */
import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { DemoUser } from '../../lib/auth/demoUsers';
import { adminClient, findUserId, hasSupabase, persona } from '../supabase';

const dir = 'samples/reports';
test.skip(!hasSupabase, 'Supabase env vars are not set (see README.md)');
test.skip(process.env.SCAN_TEST_EXTRACTOR !== '1', 'Start the dev server with SCAN_TEST_EXTRACTOR=1');
test.skip(!existsSync(`${dir}/mariam-report.pdf`), 'Run npm run samples:generate first');

async function signIn(page: Page, key: DemoUser['key']) {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email: persona(key).email });
  if (error) throw error;
  const params = new URLSearchParams({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  await page.goto(`/en/auth/callback?${params}`);
  await expect(page).not.toHaveURL(/\/auth/);
}

async function userId(key: DemoUser['key']): Promise<string> {
  const id = await findUserId({ email: persona(key).email });
  if (!id) throw new Error(`${key} is not seeded (npm run seed:auth)`);
  return id;
}

async function scannedRows(id: string) {
  const { data } = await adminClient().from('screening_results').select('id').eq('owner_id', id).eq('source', 'scan');
  return data ?? [];
}

async function clearScans(key: DemoUser['key']) {
  const id = await userId(key);
  await adminClient().from('screening_results').delete().eq('owner_id', id).eq('source', 'scan');
}

async function uploadAndRead(page: Page, locale: 'en' | 'ar', file: string) {
  await page.goto(`/${locale}/dashboard/scan?from=results`);
  await page.locator('[data-hydrated]').waitFor();
  await page.getByTestId('scan-file-input').setInputFiles(`${dir}/${file}`);
  await expect(page.getByTestId('scan-pages').locator('li')).toHaveCount(1);
  await page.getByRole('button', { name: /Read my report|اقرأ تقريري/ }).click();
  await expect(page.getByRole('heading', { name: /Check what we found|تحقّق مما وجدناه/ })).toBeVisible({ timeout: 30_000 });
}

test.describe('report scanner', () => {
  test.beforeAll(async () => {
    const { data } = await adminClient().storage.getBucket('scan-uploads');
    test.skip(!data, 'Apply 20261107000000_report_scanner.sql first');
    for (const key of ['patientL', 'patientS'] as const) {
      const { data: rows } = await adminClient().from('screening_results').select('id').eq('owner_id', await userId(key)).eq('source', 'centre');
      test.skip((rows?.length ?? 0) > 0, `${key} has a screening result; this test needs a person without one`);
      await clearScans(key);
    }
  });

  test.afterAll(async () => {
    await clearScans('patientL');
    await clearScans('patientS');
  });

  test('Mariam’s PDF: check screen, 2 findings explained, saved, labelled "From your photo"', async ({ page }) => {
    await signIn(page, 'patientL');
    await uploadAndRead(page, 'en', 'mariam-report.pdf');

    const findings = page.getByTestId('check-finding');
    await expect(findings).toHaveCount(8);
    await expect(page.getByTestId('check-result').filter({ hasText: 'Carrier' })).toHaveCount(2);
    await expect(page.getByText('As written on your report:').first()).toBeVisible();
    await page.getByTestId('own-report').check();
    await page.getByRole('button', { name: "Looks right, explain it" }).click();

    await expect(page.getByRole('heading', { name: 'Your report, explained' })).toBeVisible();
    await expect(page.getByTestId('unverified-label')).toBeVisible();
    await expect(page.locator('[data-testid="scan-finding"][data-kind="carrier"]')).toHaveCount(2);
    await expect(page.getByTestId('scan-detail')).toContainText('Carriers are healthy.');
    await expect(page.getByTestId('captions')).toBeAttached();

    await page.getByRole('button', { name: 'Save to my results' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await page.getByRole('link', { name: 'See my results' }).click();
    await expect(page).toHaveURL(/\/dashboard\/results/);
    await expect(page.getByTestId('from-photo')).toContainText('From your photo');
    await expect(page.getByTestId('findings-list')).toContainText('Beta-thalassaemia');
    await expect(page.getByTestId('findings-list')).toContainText('Spinal muscular atrophy');

    // Nothing left in storage.
    const { data: left } = await adminClient().storage.from('scan-uploads').list(await userId('patientL'));
    expect(left ?? []).toHaveLength(0);
  });

  test('a variant of uncertain significance shows the specialist card only', async ({ page }) => {
    await signIn(page, 'patientL');
    await uploadAndRead(page, 'en', 'vus-report.pdf');
    await page.getByRole('button', { name: "Looks right, explain it" }).click();
    await expect(page.getByTestId('specialist-card')).toBeVisible();
    await expect(page.locator('[data-testid="scan-finding"][data-kind="carrier"]')).toHaveCount(0);
    await expect(page.getByTestId('scan-detail')).toHaveCount(0);
    await expect(page.getByTestId('specialist-card')).not.toContainText('%');
    await expect(page.getByRole('link', { name: 'Book a counsellor' })).toBeVisible();
  });

  test('the Arabic user hears the explanation in Arabic', async ({ page }) => {
    const id = await userId('patientS');
    await adminClient().from('profiles').update({ locale: 'ar' }).eq('user_id', id);
    await signIn(page, 'patientS');
    await uploadAndRead(page, 'ar', 'arabic-report.pdf');
    await page.getByRole('button', { name: 'يبدو صحيحاً، اشرحه' }).click();

    await expect(page.getByTestId('scan-audio')).toHaveAttribute('lang', 'ar');
    await expect(page.getByTestId('captions')).toHaveAttribute('lang', 'ar');
    await expect(page.getByTestId('captions')).toContainText('التليّف الكيسي');
    await expect(page.getByTestId('captions')).toContainText('CFTR');
    await expect(page.getByTestId('narrator').getByRole('button', { name: /استمع|إيقاف مؤقت|تشغيل/ }).first()).toBeVisible();
  });

  test('camera denied falls back to upload', async ({ page }) => {
    await signIn(page, 'patientL');
    await page.goto('/en/dashboard/scan');
    await page.locator('[data-hydrated]').waitFor();
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    });
    await page.getByRole('button', { name: /Take a photo/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: "We couldn't open your camera" })).toBeVisible();
    await expect(page.getByRole('button', { name: /Take a photo/ })).toHaveCount(0);
    await expect(page.getByText('Upload a file', { exact: true })).toBeVisible();
  });

  test('leaving before saving stores nothing', async ({ page }) => {
    const id = await userId('patientL');
    await clearScans('patientL');
    await signIn(page, 'patientL');
    await uploadAndRead(page, 'en', 'mariam-report.pdf');
    await page.getByRole('button', { name: "Looks right, explain it" }).click();
    await expect(page.getByRole('heading', { name: 'Your report, explained' })).toBeVisible();
    await page.goto('/en/dashboard');

    expect(await scannedRows(id)).toHaveLength(0);
    const { data: left } = await adminClient().storage.from('scan-uploads').list(id);
    expect(left ?? []).toHaveLength(0);
  });
});
