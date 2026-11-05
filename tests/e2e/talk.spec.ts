/**
 * Talking to family (task 09, section 8). Needs the task 09 migration and
 * `npm run seed:auth`. Signs in as Mariam through the app's own callback.
 */
import { expect, test, type Page } from '@playwright/test';
import { adminClient, hasSupabase, persona } from '../supabase';

test.skip(!hasSupabase, 'Supabase env vars are not set (see README.md)');

async function signIn(page: Page) {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email: persona('mariam').email });
  if (error) throw error;
  const params = new URLSearchParams({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  await page.goto(`/en/auth/callback?${params}`);
  await page.waitForURL(/\/en\/(dashboard|onboarding|auth\/password)/);
}

test.beforeEach(async ({ page }) => {
  // Each test starts a fresh visit: no stored draft or check-in.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('gb-e2e-started')) {
      sessionStorage.clear();
      sessionStorage.setItem('gb-e2e-started', '1');
    }
    // Record WhatsApp opens instead of opening a window.
    const opened: string[] = [];
    (window as unknown as { __opened: string[] }).__opened = opened;
    window.open = ((url?: string | URL) => {
      opened.push(String(url));
      return null;
    }) as typeof window.open;
  });
  await signIn(page);
});

const opened = (page: Page) => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);

test('switching tabs updates the URL and the guide', async ({ page }) => {
  await page.goto('/en/dashboard/talk');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Talking to your partner and family');
  await expect(page.getByRole('tab', { name: 'Telling your partner' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('tab', { name: 'Telling your parents' }).click();
  await expect(page).toHaveURL(/\/en\/dashboard\/talk\?guide=parents$/);
  await expect(page.getByRole('tabpanel').getByRole('heading', { level: 2 })).toHaveText('Telling your parents');

  // Arrow keys move between tabs.
  await page.getByRole('tab', { name: 'Telling your parents' }).press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'When family pressure feels heavy' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/guide=family-pressure$/);

  // Direct links open a guide.
  await page.goto('/en/dashboard/talk?guide=relatives');
  await expect(page.getByRole('link', { name: 'Send an anonymous notice instead' })).toHaveAttribute('href', /\/en\/dashboard\/family\?notify=1$/);
});

test('"Use in message" fills the drafter', async ({ page }) => {
  await page.goto('/en/dashboard/talk');
  const phrase = 'Shall we talk it through with a counsellor together?';
  await page.getByRole('button', { name: `Put this phrase in your message: ${phrase}` }).click();
  await expect(page.getByLabel('Your message')).toHaveValue(phrase);
  await expect(page.getByLabel('Your message')).toBeFocused();
});

test('Worried shows the support card; Overwhelmed adds the support line', async ({ page }) => {
  await page.goto('/en/dashboard/talk');
  await page.getByRole('button', { name: 'Calm' }).click();
  await expect(page.getByText("Glad you're here. Take things at your own pace.")).toBeVisible();

  await page.getByRole('button', { name: 'Worried' }).click();
  await expect(page.getByRole('button', { name: 'Worried' })).toHaveAttribute('aria-pressed', 'true');
  const card = page.getByTestId('support-card');
  await expect(card).toContainText("That's a very normal reaction.");
  await expect(card.getByRole('link', { name: 'Talk to a counsellor' })).toBeVisible();
  await expect(page.getByTestId('support-line')).toHaveCount(0);

  await page.getByRole('button', { name: 'Overwhelmed' }).click();
  await expect(page.getByTestId('support-line')).toContainText('Support line: [CONFIRM]');
  await expect(page.getByTestId('support-line')).toContainText('Talk to someone now');
});

test('a draft mentioning "Khalid is a carrier" warns before WhatsApp opens', async ({ page }) => {
  await page.goto('/en/dashboard/talk');
  const draft = page.getByLabel('Your message');
  await draft.fill('Mum, Khalid is a carrier too. Can we talk?');
  await page.getByRole('button', { name: 'Send by WhatsApp' }).click();

  const warning = page.getByTestId('privacy-warning');
  await expect(warning).toContainText("This message mentions Khalid's result. Do you have their permission to share it?");
  expect(await opened(page)).toEqual([]);

  await page.getByRole('button', { name: 'Edit message' }).click();
  await expect(warning).toHaveCount(0);
  await expect(draft).toBeFocused();

  await page.getByRole('button', { name: 'Send by WhatsApp' }).click();
  await page.getByRole('button', { name: 'Khalid has agreed, continue' }).click();
  const urls = await opened(page);
  expect(urls).toHaveLength(1);
  expect(urls[0]).toMatch(/^https:\/\/wa\.me\/\?text=Mum%2C%20Khalid/);
});

test("the person's own result goes straight to WhatsApp", async ({ page }) => {
  await page.goto('/en/dashboard/talk');
  await page.getByRole('button', { name: 'Send by WhatsApp' }).click();
  await expect(page.getByTestId('privacy-warning')).toHaveCount(0);
  expect((await opened(page))[0]).toMatch(/^https:\/\/wa\.me\/\?text=/);
});

test('/counsellor?topic=family pre-ticks a family member joining', async ({ page }) => {
  await page.goto('/en/dashboard/counsellor?topic=family');
  await expect(page.getByRole('checkbox', { name: /I'd like a family member to join/ })).toBeChecked();
  await page.goto('/en/dashboard/counsellor');
  await expect(page.getByRole('checkbox', { name: /I'd like a family member to join/ })).not.toBeChecked();
});

test('the Arabic page is right-to-left', async ({ page }) => {
  await page.goto('/ar/dashboard/talk');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('الحديث مع شريك حياتك وعائلتك');
  await expect(page.getByLabel('رسالتك')).toHaveAttribute('dir', 'auto');
});
