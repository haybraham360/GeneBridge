/**
 * Programme dashboard (task 05, M8). Needs Supabase env vars, all
 * migrations, `npm run seed:auth`, `npm run seed:analytics` and
 * NEXT_PUBLIC_DEMO_DATA=true. See README.md.
 */
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { DemoUser } from '../../lib/auth/demoUsers';
import { adminClient, hasSupabase, persona } from '../supabase';

test.skip(!hasSupabase, 'Supabase env vars are not set (see README.md)');

/** Signs in through the app's own callback with a freshly minted magic link. */
async function signIn(page: Page, key: DemoUser['key']) {
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: 'magiclink',
    email: persona(key).email,
  });
  if (error) throw error;
  const params = new URLSearchParams({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  });
  await page.goto(`/en/auth/callback?${params}`);
}

const funnelRow = (page: Page, label: string) =>
  page.locator('#engagement').getByText(label, { exact: true }).locator('xpath=..');

test('an analyst lands on the dashboard and sees every panel', async ({ page }) => {
  await signIn(page, 'analyst');
  await expect(page).toHaveURL(/\/en\/admin\/analytics$/);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Programme impact');
  await expect(page.getByText('Synthetic demo data').first()).toBeVisible();

  const kpis = page.getByRole('region', { name: 'Key figures' });
  for (const title of [
    'Understanding score',
    'Counselling uptake',
    'Time to referral',
    'Onboarding completion',
  ]) {
    await expect(kpis.getByText(title, { exact: true })).toBeVisible();
  }
  for (const heading of ['From sign-up to counselling', 'Read vs listen', 'Equity by language']) {
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
  await expect(
    page.getByText('Marriage outcomes are not tracked or used as a measure of success.'),
  ).toBeVisible();

  // Side menu links scroll to sections on the same page.
  const nav = page.getByRole('navigation', { name: 'Analyst' });
  await nav.getByRole('link', { name: 'Equity' }).click();
  await expect(page).toHaveURL(/#equity$/);
  await expect(page.locator('#equity')).toBeInViewport();
});

test('a normal user visiting /admin/analytics gets a 404', async ({ page }) => {
  await signIn(page, 'mariam');
  await expect(page).not.toHaveURL(/\/auth/);
  const response = await page.goto('/en/admin/analytics');
  expect(response?.status()).toBe(404);
  await expect(page.getByText('Programme impact')).toHaveCount(0);

  const exportResponse = await page.request.get('/en/admin/analytics/export');
  expect(exportResponse.status()).toBe(404);
});

test('the Tagalog row shows "Hidden (under 10)"', async ({ page }) => {
  await signIn(page, 'analyst');
  const row = page.locator('#equity').getByRole('row', { name: /Tagalog/ });
  await expect(row).toContainText('Hidden (under 10)');
  // The flag is text plus an icon, never colour alone.
  await expect(page.locator('#equity').getByText('Below average: review').first()).toBeVisible();
});

test('"View as table" shows the funnel as a table', async ({ page }) => {
  await signIn(page, 'analyst');
  const panel = page.locator('#engagement');
  await panel.getByRole('button', { name: 'View as table' }).click();
  await expect(panel.getByRole('table')).toBeVisible();
  await expect(panel.getByRole('rowheader', { name: 'Signed up' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'View as chart' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('the centre filter changes the figures', async ({ page }) => {
  await signIn(page, 'analyst');
  const before = await funnelRow(page, 'Signed up').innerText();

  await page.getByLabel('Screening centre').selectOption('[Centre A]');
  await expect(page).toHaveURL(/centre=%5BCentre\+A%5D|centre=\[Centre\+A\]/);
  await expect(page.getByRole('heading', { name: 'From sign-up to counselling' })).toBeVisible();
  await expect.poll(() => funnelRow(page, 'Signed up').innerText()).not.toBe(before);
});

test('CSV export downloads aggregates only, with no IDs', async ({ page }) => {
  await signIn(page, 'analyst');
  await page.getByLabel('Date range').selectOption('30');
  await expect(page).toHaveURL(/range=30/);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Export report' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^genebridge-impact-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/,
  );

  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('Synthetic demo data');
  expect(csv).toContain('Last 30 days');
  expect(csv).toContain('From sign-up to counselling');
  expect(csv).toContain('Hidden (under 10)');
  expect(csv).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  expect(csv).not.toMatch(/\+?\d{9,}/);
  expect(csv).not.toMatch(/@|SYN-|AD-PMS-/);
});

test('the dashboard mirrors in Arabic', async ({ page }) => {
  await signIn(page, 'analyst');
  await page.goto('/ar/admin/analytics');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('أثر البرنامج');
  await expect(page.getByText('مخفي (أقل من 10)').first()).toBeVisible();
});
