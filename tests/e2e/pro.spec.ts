/**
 * Counsellor workspace (task 07, section 10). Needs Supabase env vars, all
 * migrations and `npm run seed:auth`. Each test re-seeds the demo queue
 * (scripts/lib/proSeed.ts), so the order of tests doesn't matter.
 */
import { expect, test, type Page } from '@playwright/test';
import type { DemoUser } from '../../lib/auth/demoUsers';
import { seedPro, type ProSeed } from '../../scripts/lib/proSeed';
import { adminClient, hasSupabase, persona, signedInAs } from '../supabase';

test.skip(!hasSupabase, 'Supabase env vars are not set (see README.md)');

let seed: ProSeed;
test.beforeEach(async () => {
  seed = await seedPro(adminClient());
});

async function signIn(page: Page, key: DemoUser['key']) {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email: persona(key).email });
  if (error) throw error;
  const params = new URLSearchParams({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  await page.goto(`/en/auth/callback?${params}`);
  await expect(page).not.toHaveURL(/\/auth/);
}

const queueCards = (page: Page) => page.getByTestId('queue').locator('[data-queue-card]');
const card = (page: Page, name: RegExp) => queueCards(page).filter({ hasText: name });

test('the queue is sorted priority first, then today, then oldest', async ({ page }) => {
  await signIn(page, 'amaka');
  await page.goto('/en/pro');
  await expect(page.getByRole('heading', { name: 'Your queue' })).toBeVisible();
  await expect(queueCards(page)).toHaveCount(4);
  const names = await queueCards(page).locator('span.font-extrabold').allTextContents();
  expect(names).toEqual(['Patient R.', 'Patient L.', 'Mariam and Khalid', 'Patient S.']);
  await expect(queueCards(page).nth(0)).toContainText('Priority');
  await expect(queueCards(page).nth(2)).toContainText(/Today \d\d:\d\d/);
});

test('the filters show the right counts', async ({ page }) => {
  await signIn(page, 'amaka');
  await page.goto('/en/pro');
  await expect(page.getByRole('button', { name: 'All (4)' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Priority (2)' }).click();
  await expect(queueCards(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Today (1)' }).click();
  await expect(queueCards(page)).toHaveCount(1);
  await expect(queueCards(page).first()).toContainText('Mariam and Khalid');
});

test('the couple detail shows only what each partner shared', async ({ page }) => {
  await signIn(page, 'amaka');
  await page.goto('/en/pro');
  await card(page, /Mariam and Khalid/).click();
  const detail = page.getByTestId('request-detail');
  await expect(detail.getByRole('heading', { name: 'Mariam and Khalid' })).toBeVisible();
  await expect(card(page, /Mariam and Khalid/)).toHaveAttribute('aria-current', 'true');
  await expect(detail.getByText('Both consented to share')).toBeVisible();
  await expect(detail.getByText('Carrier, sickle cell trait (HbAS)')).toHaveCount(2);
  await expect(detail.getByText('Differ: worth discussing')).toBeVisible();
  await expect(detail.getByText('(shared by Mariam)')).toBeVisible();
  await expect(detail.getByText(/Not shared with you: .*family map/)).toBeVisible();
  // No raw slider values or combined score anywhere.
  await expect(detail.getByText(/\b[1-5]\s*\/\s*5\b/)).toHaveCount(0);
});

test('Request access on Patient R. notifies them, and sharing reveals the result', async ({ page }) => {
  await signIn(page, 'amaka');
  await page.goto('/en/pro');
  await card(page, /Patient R\./).click();
  const detail = page.getByTestId('request-detail');
  await expect(detail.getByText(/Not shared with you: result summary/)).toBeVisible();
  await expect(detail.getByText('Variant of uncertain significance', { exact: false })).toHaveCount(0);

  await detail.getByRole('button', { name: 'Request access' }).click();
  const fullReport = detail.locator('li', { hasText: 'full report' });
  await fullReport.getByRole('button', { name: 'Ask Patient R.' }).click();
  await expect(fullReport.getByText('Requested · waiting for Patient R.')).toBeVisible();

  // Patient R. sees "Dr. Amaka asked to see your full report…" and shares.
  const { client: patientR } = await signedInAs('patientR');
  const { data: notifications } = await patientR.rpc('my_notifications');
  const ask = (notifications as { kind: string; access_request_id: string; counsellor_name: string }[]).find(
    (n) => n.kind === 'access_request',
  );
  expect(ask?.counsellor_name).toBe('Dr. Amaka Okoro');
  const { data: answer } = await patientR.rpc('respond_access_request', {
    p_access_request_id: ask!.access_request_id,
    p_share: true,
  });
  expect(answer).toBe('granted');

  await page.reload();
  await card(page, /Patient R\./).click();
  await expect(page.getByTestId('request-detail').getByText(/Variant of uncertain significance/)).toBeVisible();
  await expect(page.getByTestId('request-detail').getByText(/Patient R\. · Full report/i)).toBeVisible();
});

test("Order confirmatory test updates Mariam's care journey", async ({ page, browser }) => {
  await signIn(page, 'amaka');
  await page.goto('/en/pro');
  await card(page, /Mariam and Khalid/).click();
  await page.getByRole('button', { name: 'Order confirmatory test' }).click();
  await expect(page.getByRole('button', { name: 'Confirmatory test ordered' })).toBeDisabled();

  const context = await browser.newContext();
  const mariam = await context.newPage();
  await signIn(mariam, 'mariam');
  await mariam.goto('/en/dashboard');
  const testStep = mariam.getByTestId('care-journey').locator('[data-step="test"]');
  await expect(testStep).toHaveAttribute('data-status', 'current');
  await expect(testStep).toContainText(/Ordered/);
  await expect(mariam.getByTestId('patient-notifications')).toContainText('ordered a confirmatory test');
  await context.close();
});

test('closing a request needs an outcome category, with no marriage-related option', async ({ page }) => {
  await signIn(page, 'amaka');
  await page.goto('/en/pro');
  await card(page, /Patient S\./).click();
  await page.getByRole('button', { name: 'Close request' }).click();
  const dialog = page.getByRole('dialog', { name: 'Close this request' });
  await expect(dialog).toBeVisible();

  const options = await dialog.getByRole('radio').evaluateAll((els) =>
    els.map((el) => (el.closest('label')?.textContent ?? '').trim()),
  );
  expect(options).toEqual([
    'Information given',
    'Follow-up booked',
    'Referred for confirmatory test',
    'Referred to specialist',
    'Patient withdrew',
  ]);
  expect(options.join(' ')).not.toMatch(/marri|engage|wedding|relationship|pregnan|divorc/i);

  await dialog.getByRole('button', { name: 'Close request' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Choose an outcome to close the request.');
  await expect(dialog).toBeVisible();

  await dialog.getByRole('radio', { name: 'Information given' }).check();
  await dialog.getByRole('button', { name: 'Close request' }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, /Patient S\./)).toHaveCount(0);
});

test('patients get a 404 on /pro', async ({ page }) => {
  await signIn(page, 'mariam');
  const response = await page.goto('/en/pro');
  expect(response?.status()).toBe(404);
});

test('a counsellor at another facility sees an empty queue', async ({ page }) => {
  await signIn(page, 'layla');
  await page.goto('/en/pro');
  await expect(page.getByText('Your queue is clear.', { exact: false })).toBeVisible();
  expect(seed.requests.r).toBeTruthy();
});

test('Arabic mirrors the workspace @mobile', async ({ page }) => {
  await signIn(page, 'amaka');
  await page.goto('/ar/pro');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'قائمة طلباتك' })).toBeVisible();
  await card(page, /مريم و?خالد|Mariam/).click();
  await expect(page.getByTestId('request-detail')).toBeVisible();
  // On phones the request opens as its own view, with a way back.
  if (test.info().project.name === 'mobile') {
    await expect(page.getByTestId('queue')).toBeHidden();
    await page.getByRole('button', { name: 'العودة إلى القائمة' }).click();
    await expect(page.getByTestId('queue')).toBeVisible();
  }
});
