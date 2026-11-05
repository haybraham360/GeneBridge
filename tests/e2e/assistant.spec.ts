/**
 * Ask GeneBridge (task 06). Needs Supabase env vars, all migrations,
 * `npm run seed:auth` and `npm run seed:results`. Runs in offline mode
 * unless ANTHROPIC_API_KEY is set; the checks hold in both.
 */
import { expect, test, type Page } from '@playwright/test';
import type { DemoUser } from '../../lib/auth/demoUsers';
import { adminClient, findUserId, hasSupabase, persona } from '../supabase';

test.skip(!hasSupabase, 'Supabase env vars are not set (see README.md)');

const PATIENT_R_CODE = 'AD-PMS-2026-048215';

async function signIn(page: Page, key: DemoUser['key']) {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email: persona(key).email });
  if (error) throw error;
  const params = new URLSearchParams({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  await page.goto(`/en/auth/callback?${params}`);
  await expect(page).not.toHaveURL(/\/auth/);
}

async function openChat(page: Page, locale: 'en' | 'ar' = 'en') {
  await page.goto(`/${locale}/dashboard/assistant`);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
}

const input = (page: Page) => page.getByRole('textbox', { name: /Your question|سؤالك/ });

async function ask(page: Page, question: string) {
  await input(page).fill(question);
  await input(page).press('Enter');
}

/** The first reply can take a while when the dev server compiles the route. */
const FIRST_REPLY = { timeout: 30_000 };

const lastReply = (page: Page) => page.getByRole('log').locator('.rounded-ss-sm').last();

test('a general question gets an answer with a source chip', async ({ page }) => {
  await signIn(page, 'mariam');
  await openChat(page);
  await expect(page.getByTestId('boundary-banner')).toBeVisible();
  await ask(page, 'What is beta-thalassemia?');
  await expect(page.getByTestId('source-chips').last()).toContainText('Beta-thalassaemia', FIRST_REPLY);
  await expect(lastReply(page)).toContainText(/haemoglobin/i);
  await expect(input(page)).toBeFocused();
});

test.describe('Patient R. (flagged result)', () => {
  test.beforeAll(async () => {
    const id = await findUserId({ email: persona('patientR').email });
    await adminClient()
      .from('screening_results')
      .update({ owner_id: id, claimed_at: new Date().toISOString() })
      .eq('reference_code', PATIENT_R_CODE);
  });
  test.afterAll(async () => {
    await adminClient()
      .from('screening_results')
      .update({ owner_id: null, claimed_at: null })
      .eq('reference_code', PATIENT_R_CODE);
  });

  test('asking about the result shows an escalation card and no numbers', async ({ page }) => {
    await signIn(page, 'patientR');
    await openChat(page);
    await page.getByRole('switch', { name: 'Use my result in this chat' }).click();
    await ask(page, 'Can you explain my result?');
    const card = page.getByTestId('escalation-card');
    await expect(card).toBeVisible(FIRST_REPLY);
    await expect(card).toContainText('Priority');
    await expect(lastReply(page)).not.toContainText(/\d+\s?%/);
    await expect(page.getByRole('figure')).toHaveCount(0);

    // The share-summary checkbox is off by default.
    const share = card.getByRole('checkbox', { name: /Share a short summary/ });
    await expect(share).not.toBeChecked();
  });
});

test('"Delete this conversation" removes it', async ({ page }) => {
  await signIn(page, 'mariam');
  await openChat(page);
  await ask(page, 'What does being a carrier mean?');
  await expect(page.getByTestId('source-chips').last()).toBeVisible(FIRST_REPLY);
  const conversationId = await page.evaluate(() => sessionStorage.getItem('gb_assistant_conversation'));
  expect(conversationId).toBeTruthy();

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete this conversation' }).click();
  await expect(page.getByText('Conversation deleted.')).toBeVisible();
  await expect(page.getByRole('log').locator('.rounded-ss-sm')).toHaveCount(0);

  const { data } = await adminClient().from('assistant_conversations').select('id').eq('id', conversationId!);
  expect(data ?? []).toHaveLength(0);
});

test('the Arabic chat replies in Arabic', async ({ page }) => {
  await signIn(page, 'mariam');
  await openChat(page, 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await ask(page, 'ما هي الثلاسيميا؟');
  await expect(page.getByTestId('source-chips').last()).toBeVisible(FIRST_REPLY);
  const text = await lastReply(page).innerText();
  const letters = text.match(/\p{L}/gu) ?? [];
  const arabic = letters.filter((c) => /[؀-ۿ]/.test(c)).length;
  expect(arabic / letters.length).toBeGreaterThan(0.6);
});
