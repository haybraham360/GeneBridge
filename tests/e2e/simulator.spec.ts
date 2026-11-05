/**
 * Inheritance simulator (pillar 3): any condition, editable parents, and
 * numbers that match the engine. Signs in as the Mariam persona.
 */
import { expect, test, type Page } from '@playwright/test';
import { adminClient, hasSupabase, persona } from '../supabase';

test.skip(!hasSupabase, 'Supabase env vars are not set (see README.md)');

async function signIn(page: Page) {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email: persona('mariam').email });
  if (error) throw error;
  const params = new URLSearchParams({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  await page.goto(`/en/auth/callback?${params}`);
  await page.waitForURL(/\/en\/(dashboard|onboarding)/);
}

const shots = process.env.SIM_SHOTS;

test('general example: parents, chances and 100 runs', async ({ page }) => {
  await signIn(page);
  await page.goto('/en/dashboard/simulator');
  await expect(page.getByRole('heading', { name: 'Inheritance simulator' })).toBeVisible();
  await expect(page.getByText("This isn't a diagnosis.", { exact: false })).toBeVisible();

  // Two carriers: 25 / 50 / 25 from the engine.
  const chances = page.getByRole('img', { name: /25% Has the condition, 50% healthy carrier, 25% no changed copy/ });
  await expect(chances).toBeVisible();

  // Changing a parent updates the chances: one parent has it, the other is a carrier.
  await page.getByRole('radiogroup', { name: 'Parent 1: change status' }).getByRole('radio', { name: 'Has the condition' }).click();
  await expect(page.getByRole('img', { name: /50% Has the condition, 50% healthy carrier, 0% no changed copy/ })).toBeVisible();

  await page.getByRole('button', { name: 'Recessive: both parents carriers' }).click();
  await page.getByRole('button', { name: 'Simulate one pregnancy' }).click();
  await expect(page.getByText(/^This child (has|is)/)).toBeVisible();
  await expect(page.getByText('Pregnancies so far')).toBeVisible();

  await page.getByRole('button', { name: 'Run 100 times' }).click();
  await expect(page.getByRole('img', { name: /^100 of 100 simulated pregnancies shown/ })).toBeVisible({ timeout: 10_000 });
  if (shots) {
    await page.locator('section[aria-labelledby="many-title"]').screenshot({ path: `${shots}/sim-many.png` });
    await page.getByRole('heading', { name: 'Inheritance simulator' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}/sim-general.png` });
  }
});

test('any condition: X-linked from the catalogue, with son and daughter chances', async ({ page }) => {
  await signIn(page);
  await page.goto('/en/dashboard/simulator?condition=g6pd_deficiency');
  await expect(page.getByText('G6PD deficiency', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mother' })).toBeVisible();
  await expect(page.getByText('If it is a son')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Book a counsellor' })).toBeVisible();
  // A father has one X: there is no carrier choice for him.
  await expect(page.getByRole('radiogroup', { name: 'Father: change status' }).getByRole('radio')).toHaveCount(2);
  await page.getByRole('button', { name: 'Simulate one pregnancy' }).click();
  await expect(page.getByText(/^This (son|daughter)/)).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/sim-xlinked.png`, fullPage: true });
});

test('picker: choose a condition, and complex patterns are not simulated', async ({ page }) => {
  await signIn(page);
  await page.goto('/en/dashboard/simulator');
  await page.getByRole('button', { name: 'Find your condition' }).click();
  await page.getByRole('searchbox', { name: 'Search conditions' }).fill('alpha');
  if (shots) await page.screenshot({ path: `${shots}/sim-picker.png`, fullPage: true });
  await page.getByRole('button', { name: /Alpha-thalassaemia/ }).click();
  await expect(page).toHaveURL(/condition=alpha_thalassemia/);
  await expect(page.getByRole('heading', { name: /follows a more complex pattern/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simulate one pregnancy' })).toHaveCount(0);
});

test('Arabic renders right to left', async ({ page }) => {
  await signIn(page);
  await page.goto('/ar/dashboard/simulator?condition=sickle_cell_disease');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('button', { name: 'محاكاة حمل واحد' }).click();
  await expect(page.getByText(/^هذا الطفل/)).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/sim-ar.png`, fullPage: true });
});
