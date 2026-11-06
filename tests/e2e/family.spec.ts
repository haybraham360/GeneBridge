/**
 * "Describe your family" (task 13): the tree draws itself.
 *
 * Needs Supabase env vars, all migrations (including
 * 20261108000000_family_tree.sql), `npm run seed:auth`, and the dev server
 * started with FAMILY_TEST_PLANNER=1, so descriptions are read by the
 * rule-based planner instead of the AI service:
 *
 *   FAMILY_TEST_PLANNER=1 npx playwright test family
 *
 * (Stop any dev server already running without it: Playwright reuses it.)
 * Mariam's tree is reset to only herself before each test.
 */
import { expect, test, type Page } from '@playwright/test';
import type { DemoUser } from '../../lib/auth/demoUsers';
import { adminClient, findUserId, hasSupabase, persona } from '../supabase';

test.skip(!hasSupabase, 'Supabase env vars are not set (see README.md)');
test.skip(process.env.FAMILY_TEST_PLANNER !== '1', 'Start the dev server with FAMILY_TEST_PLANNER=1');

const DEMO_EN =
  "My father Ahmed has a brother, Saeed, who has beta-thalassemia major. My husband Khalid is Saeed's son. My mother's mother, Noura, had hearing problems, but I'm not sure if it was genetic.";
const DEMO_AR = 'عمي سعيد عنده ثلاسيميا، وزوجي خالد ابن عمي. جدتي أم أمي كانت عندها مشاكل في السمع';

async function signIn(page: Page, key: DemoUser['key']) {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email: persona(key).email });
  if (error) throw error;
  const params = new URLSearchParams({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  await page.goto(`/en/auth/callback?${params}`);
  await expect(page).not.toHaveURL(/\/auth/);
}

let mariamId = '';

async function resetFamily() {
  mariamId ||= (await findUserId({ email: persona('mariam').email })) ?? '';
  if (!mariamId) throw new Error('Mariam is not seeded (npm run seed:auth)');
  await adminClient().from('family_members').delete().eq('owner_id', mariamId);
  await adminClient().from('family_members').insert({ owner_id: mariamId, relation_to_owner: 'self', is_owner: true, generation: 0 });
}

async function saved() {
  const { data } = await adminClient().from('family_members').select('label, placeholder, is_owner').eq('owner_id', mariamId);
  return data ?? [];
}

async function describe(page: Page, text: string, locale: 'en' | 'ar' = 'en') {
  await page.goto(`/${locale}/dashboard/family`);
  await page.locator('[data-hydrated]').waitFor();
  await page.getByLabel(locale === 'en' ? 'Your description' : 'وصفك').fill(text);
  await page.getByRole('button', { name: locale === 'en' ? 'Draw it' : 'ارسمها' }).click();
  await expect(page.getByTestId('family-review')).toBeVisible({ timeout: 20_000 });
}

const canvas = (page: Page) => page.getByTestId('family-canvas');
const node = (page: Page, name: string) => canvas(page).locator('[data-person]', { hasText: name });

test.describe('describe your family', () => {
  test.beforeEach(async ({ page }) => {
    await resetFamily();
    await signIn(page, 'mariam');
  });
  test.afterAll(resetFamily);

  test('typing the demo description shows dashed proposed people and a neutral cousin line', async ({ page }) => {
    await describe(page, DEMO_EN);
    for (const name of ['Ahmed', 'Saeed', 'Khalid', 'Noura']) await expect(node(page, name)).toHaveAttribute('data-proposed', 'true');
    await expect(node(page, 'Saeed')).toContainText('Beta-thalassaemia · Has it');
    await expect(node(page, 'Noura')).toContainText('Other: hearing problems · Not sure');
    await expect(canvas(page).locator('path[data-kind="cousins"]')).toHaveCount(1);
    await expect(page.getByTestId('family-review-summary')).toContainText('Added 4 people and 2 conditions. A cousin marriage was marked.');
    // Unknown connectors are marked as such, and nothing is saved yet.
    await expect(canvas(page).locator('[data-placeholder="true"]').first()).toContainText('Unknown');
    expect((await saved()).length).toBe(1);
  });

  test('"Keep all" saves them', async ({ page }) => {
    await describe(page, DEMO_EN);
    await page.getByRole('button', { name: 'Keep all' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved to your family map.');
    await expect(canvas(page).locator('[data-proposed="true"]')).toHaveCount(0);
    const rows = await saved();
    expect(rows.filter((r) => !r.placeholder && !r.is_owner).map((r) => r.label).sort()).toEqual(['Ahmed', 'Khalid', 'Noura', 'Saeed']);
    await page.reload();
    await expect(node(page, 'Khalid')).toBeVisible();
    await expect(page.getByTestId('family-ask')).toContainText('Ask GeneBridge');
  });

  test('"Undo" removes them', async ({ page }) => {
    await describe(page, DEMO_EN);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(canvas(page).locator('[data-person]')).toHaveCount(1);
    expect((await saved()).length).toBe(1);
  });

  test('reviewing one by one keeps or skips each person', async ({ page }) => {
    await describe(page, DEMO_EN);
    await page.getByRole('button', { name: 'Review one by one' }).click();
    await expect(page.getByTestId('family-review-item')).toBeVisible();
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect.poll(async () => (await saved()).filter((r) => !r.is_owner && !r.placeholder).length).toBe(1);
  });

  test('the clarifying question chips update the tree', async ({ page }) => {
    await describe(page, DEMO_EN);
    const questions = page.getByTestId('family-questions');
    await expect(questions).toContainText('Noura: do you mean Congenital hearing loss (GJB2)?');
    await questions.getByRole('button', { name: 'Yes' }).click();
    await expect(node(page, 'Noura')).toContainText('Congenital hearing loss (GJB2) · Not sure');

    // Ambiguous English: asks which side instead of guessing.
    await page.getByRole('button', { name: 'Keep all' }).click();
    await page.getByLabel('Your description').fill('My uncle has CF.');
    await page.getByRole('button', { name: 'Draw it' }).click();
    await expect(questions).toContainText("Is your uncle on your father's side or your mother's side?");
    await expect(canvas(page).locator('[data-proposed="true"]')).toHaveCount(0);
    await questions.getByRole('button', { name: "Mother's side" }).click();
    await expect(canvas(page).locator('[data-proposed="true"]', { hasText: "Uncle (mother's side)" })).toContainText('Cystic fibrosis · Has it');
  });

  test('list view matches the tree', async ({ page }) => {
    await describe(page, DEMO_EN);
    const inTree = (await canvas(page).locator('[data-person]').evaluateAll((els) => els.map((e) => e.getAttribute('data-person')))).sort();
    await page.getByRole('radio', { name: 'List view' }).click();
    const list = page.getByTestId('family-list');
    const inList = (await list.locator('li[data-person]').evaluateAll((els) => els.map((e) => e.getAttribute('data-person')))).sort();
    expect(inList).toEqual(inTree);
    await expect(list).toContainText('marked as a marriage between cousins');
    await expect(list).toContainText('Proposed, not saved yet');
  });

  test('the Arabic description builds the same tree, mirrored right to left', async ({ page }) => {
    await describe(page, DEMO_AR, 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(node(page, 'سعيد')).toContainText('الثلاسيميا بيتا');
    await expect(node(page, 'خالد')).toHaveAttribute('data-proposed', 'true');
    await expect(canvas(page).locator('path[data-kind="cousins"]')).toHaveCount(1);
    // No "which side?" question: عم is the father's brother.
    await expect(page.getByTestId('family-questions')).not.toContainText('جهة');
    // The father's side is on the reading-start side: the right, in Arabic.
    const uncle = await node(page, 'سعيد').boundingBox();
    const grandmother = await canvas(page).locator('[data-person]', { hasText: 'الجدة (أم الأم)' }).boundingBox();
    expect(uncle!.x).toBeGreaterThan(grandmother!.x);
  });

  test('a blocked microphone falls back to typing', async ({ page }) => {
    await page.addInitScript(() => {
      class Denied {
        lang = '';
        interimResults = false;
        continuous = false;
        onresult = null;
        onend: (() => void) | null = null;
        onerror: ((e: { error: string }) => void) | null = null;
        start() {
          setTimeout(() => {
            this.onerror?.({ error: 'not-allowed' });
            this.onend?.();
          }, 50);
        }
        stop() {}
        abort() {}
      }
      (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = Denied;
    });
    await page.goto('/en/dashboard/family');
    await page.locator('[data-hydrated]').waitFor();
    await page.getByTestId('family-mic').click();
    await expect(page.getByTestId('family-mic-message')).toHaveText('The microphone is blocked, so you can type your description instead.');
    await expect(page.getByLabel('Your description')).toBeFocused();
    await page.getByLabel('Your description').fill('My sister has CF.');
    await page.getByRole('button', { name: 'Draw it' }).click();
    await expect(canvas(page).locator('[data-proposed="true"]', { hasText: 'Sister' })).toBeVisible({ timeout: 20_000 });
  });
});
