/**
 * Personalised paths, sign out and no pricing (task 11, section 10). Uses a
 * throwaway account and a throwaway screening result, both removed after.
 * Needs the task 11 migration.
 */
import { expect, test, type Page } from '@playwright/test';
import { adminClient, hasSupabase, persona } from '../supabase';

test.skip(!hasSupabase, 'Supabase env vars are not set (see README.md)');

const run = Date.now();
const email = `explore-e2e-${run}@example.test`;
const reference = `AD-PMS-2026-9${String(run).slice(-6)}`;
let userId: string;

test.beforeAll(async () => {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { display_name: 'Sara' } });
  if (error) throw error;
  userId = data.user.id;
  await admin.from('profiles').update({ display_name: 'Sara', locale: 'en' }).eq('user_id', userId);
  await admin.from('consents').insert({ user_id: userId, kind: 'terms' });
  await admin.from('screening_results').insert({
    reference_code: reference,
    condition_code: 'gjb2_hearing_loss',
    status: 'carrier',
    genotype: null,
    flagged: false,
    flag_reason: null,
    reported_at: '2026-10-20T09:00:00Z',
    centre: '[Screening centre]',
  });
});

test.afterAll(async () => {
  const admin = adminClient();
  await admin.from('screening_results').delete().eq('reference_code', reference);
  if (userId) await admin.auth.admin.deleteUser(userId);
});

async function signIn(page: Page, address: string) {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email: address });
  if (error) throw error;
  const params = new URLSearchParams({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  await page.goto(`/en/auth/callback?${params}`);
}

const stepLabel = (page: Page, n: number) => page.getByText(`Step ${n} of 8`, { exact: true });

test('exploring: "I think I may have a condition" + hearing loss, then adding a result', async ({ page }) => {
  await signIn(page, email);
  await expect(page).toHaveURL(/\/en\/onboarding$/);

  await page.getByRole('button', { name: "Let's start" }).click();
  for (const n of [2, 3]) {
    await expect(stepLabel(page, n)).toBeVisible();
    await page.getByRole('button', { name: 'Skip' }).click();
  }
  await page.getByRole('radio', { name: /I think I may have a condition/ }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('checkbox', { name: 'I understand and agree' }).check();
  await page.getByRole('button', { name: 'I agree' }).click();

  // Step 6 branches to the condition picker.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Which condition would you like to understand?');
  await expect(page.getByText("Choosing a condition doesn't mean you have it.")).toBeVisible();
  await page.getByLabel('Search conditions').fill('GJB2');
  await page.getByRole('button', { name: 'Congenital hearing loss (GJB2)' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Skip' }).click();

  await expect(page.getByText('Exploring: Congenital hearing loss (GJB2)')).toBeVisible();
  await page.getByRole('link', { name: 'Start learning' }).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);

  // Exploring Home: never a diagnosis.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome, Sara');
  const banner = page.getByTestId('not-diagnosis-banner');
  await expect(banner).toContainText('because you think you may have it');
  await expect(banner).toContainText("This isn't a diagnosis.");
  await expect(page.getByRole('link', { name: 'My conditions' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'My results' })).toHaveCount(0);

  // Couple view asks for a result first.
  await page.goto('/en/dashboard/couple');
  await expect(page.getByTestId('couple-needs-result')).toBeVisible();

  // Adding a result switches Home to the result view and keeps the condition.
  await page.goto('/en/dashboard');
  await page.getByRole('button', { name: /Already have a result\?/ }).click();
  await page.getByLabel('Screening reference number').fill(reference);
  await page.getByRole('button', { name: 'Connect result' }).click();
  await expect(page.getByTestId('not-diagnosis-banner')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: "Conditions you're following" })).toBeVisible();
  await expect(page.getByText('Congenital hearing loss (GJB2)')).toBeVisible();
  await expect(page.getByRole('link', { name: 'My results' })).toBeVisible();
});

for (const { who, path } of [
  { who: 'mariam', path: '/en/dashboard' },
  { who: 'amaka', path: '/en/pro' },
  { who: 'analyst', path: '/en/admin/analytics' },
] as const) {
  test(`Sign out from the ${path} side menu lands on / with a toast`, async ({ page }) => {
    await signIn(page, persona(who).email);
    await page.goto(path);
    await page.evaluate(() => sessionStorage.setItem('gb-talk-draft', '{"text":"hello"}'));
    const button = page.getByRole('button', { name: 'Sign out' });
    // At least 44px tall, and it works by keyboard.
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.getByTestId('signed-out-toast')).toHaveText("You've signed out.");
    expect(await page.evaluate(() => sessionStorage.getItem('gb-talk-draft'))).toBeNull();
  });
}

test('the landing page has no pricing in English or Arabic', async ({ page }) => {
  for (const locale of ['en', 'ar']) {
    await page.goto(`/${locale}`);
    await expect(page.locator('a[href*="pricing"]')).toHaveCount(0);
    await expect(page.locator('#pricing')).toHaveCount(0);
    await expect(page.getByRole('link', { name: locale === 'en' ? 'Pricing' : 'الأسعار' })).toHaveCount(0);
  }
});
